#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <driver/i2s.h>
#include <math.h>
#include <string.h>

#define I2S_WS    25
#define I2S_SD    23
#define I2S_SCK   26

#define TRIG_PIN  18
#define ECHO_PIN  19

#define MPU_SDA   21
#define MPU_SCL   22
#define MPU_ADDR  0x68

#define GREEN_LED_PIN 32
#define BLUE_LED_PIN  33
#define RED_LED_PIN   27

#define MIC_DB_OFFSET 90.0f

const unsigned long SEND_INTERVAL_MS = 500;
const unsigned long LINK_TIMEOUT_MS = 10000;
unsigned long lastSendTime = 0;
unsigned long lastGatewayContactTime = 0;

uint8_t gatewayMAC[] = {0x6C, 0xC8, 0x40, 0x78, 0xEB, 0xC0};

bool ledColorReceived = false;
char currentLedColor[16] = "";

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

int16_t accelX = 0, accelY = 0, accelZ = 0;
int16_t gyroX = 0, gyroY = 0, gyroZ = 0;
int16_t temperatureRaw = 0;

void updateLeds() {
  bool linkAlive = (millis() - lastGatewayContactTime) <= LINK_TIMEOUT_MS;

  digitalWrite(BLUE_LED_PIN, linkAlive ? HIGH : LOW);

  if (!ledColorReceived) {
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(RED_LED_PIN, LOW);
    return;
  }

  if (strcmp(currentLedColor, "green") == 0) {
    digitalWrite(GREEN_LED_PIN, HIGH);
    digitalWrite(RED_LED_PIN, LOW);
  } else if (strcmp(currentLedColor, "red") == 0) {
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(RED_LED_PIN, HIGH);
  } else {
    digitalWrite(GREEN_LED_PIN, LOW);
    digitalWrite(RED_LED_PIN, LOW);
  }
}

void onDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  Serial.print("ESP-NOW send: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");

  if (status == ESP_NOW_SEND_SUCCESS) {
    lastGatewayContactTime = millis();
  }
}

void onDataRecv(const esp_now_recv_info_t *recvInfo, const uint8_t *incomingData, int len) {
  if (len == sizeof(LedColorPayload)) {
    LedColorPayload incoming = {};
    memcpy(&incoming, incomingData, sizeof(incoming));

    strncpy(currentLedColor, incoming.led_color, sizeof(currentLedColor) - 1);
    currentLedColor[sizeof(currentLedColor) - 1] = '\0';

    ledColorReceived = true;
    lastGatewayContactTime = millis();

    Serial.print("Received led_color: ");
    Serial.println(currentLedColor);
  } else {
    Serial.print("Received unexpected packet length: ");
    Serial.println(len);
  }
}

void setupMic() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_I2S,
    .intr_alloc_flags = 0,
    .dma_buf_count = 8,
    .dma_buf_len = 256,
    .use_apll = false
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num   = I2S_SCK,
    .ws_io_num    = I2S_WS,
    .data_out_num = -1,
    .data_in_num  = I2S_SD
  };

  i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_NUM_0, &pin_config);
}

bool setupMPU() {
  Wire.begin(MPU_SDA, MPU_SCL);
  Wire.setClock(100000);
  delay(100);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  return Wire.endTransmission(true) == 0;
}

bool readMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  uint8_t txStatus = Wire.endTransmission(false);
  if (txStatus != 0) {
    Serial.printf("MPU tx failed: %u\n", txStatus);
    return false;
  }

  uint8_t count = Wire.requestFrom(MPU_ADDR, (uint8_t)14);
  if (count < 14) {
    Serial.printf("MPU requestFrom got %u bytes\n", count);
    return false;
  }

  accelX = (Wire.read() << 8) | Wire.read();
  accelY = (Wire.read() << 8) | Wire.read();
  accelZ = (Wire.read() << 8) | Wire.read();
  temperatureRaw = (Wire.read() << 8) | Wire.read();
  gyroX = (Wire.read() << 8) | Wire.read();
  gyroY = (Wire.read() << 8) | Wire.read();
  gyroZ = (Wire.read() << 8) | Wire.read();

  return true;
}

float getDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return -1.0;

  return duration * 0.0343 / 2.0;
}

float getNoiseDb() {
  static float smoothedDb = 0.0f;
  static bool initialized = false;
  static int32_t buffer[256];

  size_t bytes_read = 0;

  esp_err_t err = i2s_read(I2S_NUM_0, buffer, sizeof(buffer), &bytes_read, pdMS_TO_TICKS(100));
  if (err != ESP_OK || bytes_read == 0) {
    return initialized ? smoothedDb : 0.0f;
  }

  int samples = bytes_read / sizeof(int32_t);
  if (samples == 0) {
    return initialized ? smoothedDb : 0.0f;
  }

  double sumSquares = 0.0;
  for (int i = 0; i < samples; i++) {
    int32_t s24 = buffer[i] >> 8;
    double s = (double)s24 / 8388608.0;
    sumSquares += s * s;
  }

  double rms = sqrt(sumSquares / samples);
  if (rms < 1e-6) rms = 1e-6;

  float db = 20.0f * log10f((float)rms) + MIC_DB_OFFSET;

  if (!initialized) {
    smoothedDb = db;
    initialized = true;
  } else {
    smoothedDb = 0.6f * smoothedDb + 0.4f * db;
  }

  return smoothedDb;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(BLUE_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);

  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(BLUE_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  setupMic();

  if (setupMPU()) {
    Serial.println("MPU-6050 OK");
  } else {
    Serial.println("MPU-6050 FAIL — check wiring");
  }

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  const uint8_t GATEWAY_CHANNEL = 6;
  esp_wifi_set_channel(GATEWAY_CHANNEL, WIFI_SECOND_CHAN_NONE);

  Serial.print("Sensor node MAC: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW init failed!");
    return;
  }

  esp_now_register_send_cb(onDataSent);
  esp_now_register_recv_cb(onDataRecv);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, gatewayMAC, 6);
  peerInfo.channel = GATEWAY_CHANNEL;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add gateway peer");
  } else {
    Serial.println("Gateway peer added");
  }

  Serial.println("Sensor node ready.\n");
}

void loop() {
  if (millis() - lastSendTime < SEND_INTERVAL_MS) {
    updateLeds();
    delay(10);
    return;
  }

  lastSendTime = millis();

  bool mpuOk = readMPU();
  if (!mpuOk) {
    delay(5);
    mpuOk = readMPU();
  }

  if (!mpuOk) {
    Serial.println("MPU read failed, using previous values");
  }

  SensorPayload data = {};
  strncpy(data.nodeId, "node_02", sizeof(data.nodeId));
  data.accel_x = accelX / 16384.0;
  data.accel_y = accelY / 16384.0;
  data.accel_z = accelZ / 16384.0;
  data.gyro_x = gyroX / 131.0;
  data.gyro_y = gyroY / 131.0;
  data.gyro_z = gyroZ / 131.0;
  data.noise_db = getNoiseDb();
  data.distance_cm = getDistanceCm();
  data.timestamp = millis();

  updateLeds();

  Serial.printf("TX: ax=%.3f ay=%.3f az=%.3f gx=%.1f gy=%.1f gz=%.1f noise_db=%.2f dist=%.1f led_color=%s\n",
    data.accel_x, data.accel_y, data.accel_z,
    data.gyro_x, data.gyro_y, data.gyro_z,
    data.noise_db, data.distance_cm,
    ledColorReceived ? currentLedColor : "unknown");

  esp_err_t result = esp_now_send(gatewayMAC, (uint8_t *)&data, sizeof(data));
  if (result != ESP_OK) {
    Serial.println("esp_now_send error");
  }
}
