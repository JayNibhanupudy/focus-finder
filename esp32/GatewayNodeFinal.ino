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
  float    noise_db;
  float    distance_cm;
  uint32_t timestamp;
} SensorPayload;

typedef struct __attribute__((packed)) {
  char led_color[16];
} LedColorPayload;

volatile bool newDataReady = false;
SensorPayload latestData;
uint8_t latestSenderMac[6];

void printMac(const uint8_t *mac) {
  Serial.printf("%02X:%02X:%02X:%02X:%02X:%02X",
    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

bool ensurePeer(const uint8_t *mac) {
  if (esp_now_is_peer_exist(mac)) {
    return true;
  }

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, mac, 6);
  peerInfo.channel = WiFi.channel();
  peerInfo.encrypt = false;

  esp_err_t result = esp_now_add_peer(&peerInfo);
  if (result != ESP_OK) {
    Serial.print("Failed to add peer: ");
    printMac(mac);
    Serial.printf(" error=%d\n", result);
    return false;
  }

  Serial.print("Added peer: ");
  printMac(mac);
  Serial.println();
  return true;
}

void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(SensorPayload)) {
    Serial.printf("Bad packet: got %d bytes, expected %d\n", len, sizeof(SensorPayload));
    return;
  }

  memcpy(&latestData, data, sizeof(SensorPayload));
  memcpy(latestSenderMac, info->src_addr, 6);
  newDataReady = true;

  Serial.print("RX from ");
  printMac(info->src_addr);
  Serial.println();
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
  json += "\"noise_db\":" + String(d.noise_db, 2) + ",";
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
  client.setInsecure();

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

String fetchLedColor(const char *nodeId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected — reconnecting...");
    connectToWiFi();
  }

  String url = String(FIREBASE_DB_URL) + "/nodes/" + String(nodeId) + "/led_color.json";

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (https.begin(client, url)) {
    int code = https.GET();

    if (code == 200) {
      String response = https.getString();
      response.trim();
      https.end();

      if (response.startsWith("\"") && response.endsWith("\"") && response.length() >= 2) {
        response = response.substring(1, response.length() - 1);
      }

      Serial.print("led_color for ");
      Serial.print(nodeId);
      Serial.print(": ");
      Serial.println(response);

      return response;
    } else {
      Serial.printf("led_color fetch HTTP %d\n", code);
    }

    https.end();
  } else {
    Serial.println("HTTPS begin failed for led_color fetch");
  }

  return "";
}

void sendLedColorToNode(const uint8_t *destMac, const String &ledColor) {
  if (!ensurePeer(destMac)) {
    return;
  }

  LedColorPayload payload = {};
  ledColor.toCharArray(payload.led_color, sizeof(payload.led_color));

  esp_err_t result = esp_now_send(destMac, (uint8_t *)&payload, sizeof(payload));

  Serial.print("Sending led_color='");
  Serial.print(ledColor);
  Serial.print("' to ");
  printMac(destMac);
  Serial.print(" -> ");

  if (result == ESP_OK) {
    Serial.println("OK");
  } else {
    Serial.printf("FAIL (%d)\n", result);
  }
}

void checkTamperStatus(const char *nodeId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected — reconnecting...");
    connectToWiFi();
  }

  String url = String(FIREBASE_DB_URL) + "/nodes/" + String(nodeId) + "/tamper_detected.json";

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  if (https.begin(client, url)) {
    int code = https.GET();

    if (code == 200) {
      String response = https.getString();
      response.trim();
      Serial.print("tamper_detected for ");
      Serial.print(nodeId);
      Serial.print(": ");
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

  connectToWiFi();

  Serial.println("====================================");
  Serial.print("GATEWAY MAC ADDRESS: ");
  Serial.println(WiFi.macAddress());
  Serial.println("Copy this into gatewayMAC[] in the sensor node sketch.");
  Serial.print("WiFi channel: ");
  Serial.println(WiFi.channel());
  Serial.println("Set GATEWAY_CHANNEL in sensor node to this number.");
  Serial.println("====================================\n");

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed!");
    return;
  }

  esp_now_register_recv_cb(onDataRecv);

  Serial.println("Gateway ready — waiting for ESP-NOW data...\n");
}

void loop() {
  if (newDataReady) {
    newDataReady = false;

    Serial.printf("RX: node=%s ax=%.3f ay=%.3f az=%.3f gx=%.1f gy=%.1f gz=%.1f noise_db=%.2f dist=%.1f\n",
      latestData.nodeId,
      latestData.accel_x, latestData.accel_y, latestData.accel_z,
      latestData.gyro_x, latestData.gyro_y, latestData.gyro_z,
      latestData.noise_db, latestData.distance_cm);

    sendToFirebase(latestData);

    String ledColor = fetchLedColor(latestData.nodeId);
    if (ledColor.length() > 0) {
      sendLedColorToNode(latestSenderMac, ledColor);
    } else {
      Serial.println("No led_color returned from Firebase");
    }

    checkTamperStatus(latestData.nodeId);
  }

  delay(10);
}
