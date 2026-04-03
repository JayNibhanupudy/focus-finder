
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

#define WIFI_SSID     "EliHotspot"
#define WIFI_PASSWORD "pink+white"

#define FIREBASE_DB_URL "https://focus-finder-ab981-default-rtdb.firebaseio.com"

typedef struct __attribute__((packed)) {
  char     nodeId[16];
  float    accel_x;
  float    accel_y;
  float    accel_z;
  float    gyro_x;
  float    gyro_y;
  float    gyro_z;
  int32_t  noise_level;
  float    distance_cm;
  uint32_t timestamp;
} SensorPayload;

volatile bool newDataReady = false;
SensorPayload latestData;

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(SensorPayload)) {
    Serial.printf("Bad packet: got %d bytes, expected %d\n", len, sizeof(SensorPayload));
    return;
  }

  memcpy(&latestData, data, sizeof(SensorPayload));
  newDataReady = true;

  const uint8_t *mac = info->src_addr;
  Serial.printf("RX from %02X:%02X:%02X:%02X:%02X:%02X\n",
    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}


void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected — IP: " + WiFi.localIP().toString());
}


String buildJson(const SensorPayload &d) {
  String json = "{";
  json += "\"accel_x\":" + String(d.accel_x, 6) + ",";
  json += "\"accel_y\":" + String(d.accel_y, 6) + ",";
  json += "\"accel_z\":" + String(d.accel_z, 6) + ",";
  json += "\"gyro_x\":" + String(d.gyro_x, 6) + ",";
  json += "\"gyro_y\":" + String(d.gyro_y, 6) + ",";
  json += "\"gyro_z\":" + String(d.gyro_z, 6) + ",";
  json += "\"noise_db\":" + String(d.noise_level) + ",";
  json += "\"distance_cm\":" + String(d.distance_cm, 1) + ",";
  json += "\"timestamp\":" + String(d.timestamp);
  json += "}";
  return json;
}


void sendToFirebase(const SensorPayload &d) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected — reconnecting...");
    connectToWiFi();
  }

  String json = buildJson(d);

  String url = String(FIREBASE_DB_URL) + "/readings/" + String(d.nodeId) + ".json";

  WiFiClientSecure client;
  client.setInsecure();  // skip cert verification (OK for prototyping)

  HTTPClient https;
  if (https.begin(client, url)) {
    https.addHeader("Content-Type", "application/json");

    int code = https.POST(json);
    Serial.printf("Firebase HTTP %d\n", code);

    if (code > 0) {
      Serial.println("  -> " + https.getString());
    }

    https.end();
  } else {
    Serial.println("HTTPS begin failed");
  }

  Serial.println("  JSON: " + json);
}


void checkTamperStatus() {
  String url = String(FIREBASE_DB_URL) + "/nodes/node_02/tamper_detected.json";

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (https.begin(client, url)) {
    int code = https.GET();

    if (code == 200) {
      String response = https.getString();
      response.trim();
      Serial.print("tamper_detected: ");
      Serial.println(response);
    } else {
      Serial.printf("Tamper check HTTP %d\n", code);
    }

    https.end();
  }
}


void setup() {
  Serial.begin(115200);
  delay(1000);

  // Connect WiFi first
  connectToWiFi();

  // Print MAC so you can paste it into the sensor node sketch
  Serial.println("====================================");
  Serial.print("GATEWAY MAC ADDRESS: ");
  Serial.println(WiFi.macAddress());
  Serial.println("Copy this into gatewayMAC[] in the sensor node sketch.");
  Serial.print("WiFi channel: ");
  Serial.println(WiFi.channel());
  Serial.println("Set GATEWAY_CHANNEL in sensor node to this number.");
  Serial.println("====================================\n");

  // Init ESP-NOW (works alongside WiFi on the same channel)
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed!");
    return;
  }

  esp_now_register_recv_cb(onDataRecv);

  Serial.println("Gateway ready — waiting for ESP-NOW data...\n");
}

// ---- Loop ----

void loop() {
  if (newDataReady) {
    newDataReady = false;

    Serial.printf("RX: ax=%.3f ay=%.3f az=%.3f gx=%.1f gy=%.1f gz=%.1f noise=%d dist=%.1f\n",
      latestData.accel_x, latestData.accel_y, latestData.accel_z,
      latestData.gyro_x, latestData.gyro_y, latestData.gyro_z,
      latestData.noise_level, latestData.distance_cm);

    sendToFirebase(latestData);
    checkTamperStatus();
  }

  delay(10);  // yield to background tasks
}
