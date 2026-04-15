#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <driver/i2s.h>

#define I2S_WS    25
#define I2S_SD    23
#define I2S_SCK   26

#define TRIG_PIN  18
#define ECHO_PIN  19

#define MPU_SDA   21
#define MPU_SCL   22
#define MPU_ADDR  0x68

const unsigned long SEND_INTERVAL_MS = 3000;
unsigned long lastSendTime = 0;

uint8_t gatewayMAC[] = {0x00, 0x70, 0x07, 0xE9, 0x96, 0x5C};

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

int16_t accelX, accelY, accelZ;
int16_t gyroX, gyroY, gyroZ;
int16_t temperatureRaw;

void onDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
  Serial.print("ESP-NOW send: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "OK" : "FAIL");
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

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  return Wire.endTransmission(true) == 0;
}

bool readMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;

  Wire.requestFrom(MPU_ADDR, (uint8_t)14);
  if (Wire.available() < 14) return false;

  accelX       = (Wire.read() << 8) | Wire.read();
  accelY       = (Wire.read() << 8) | Wire.read();
  accelZ       = (Wire.read() << 8) | Wire.read();
  temperatureRaw = (Wire.read() << 8) | Wire.read();
  gyroX        = (Wire.read() << 8) | Wire.read();
  gyroY        = (Wire.read() << 8) | Wire.read();
  gyroZ        = (Wire.read() << 8) | Wire.read();

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

int getNoiseLevel() {
  int32_t buffer[256];
  size_t bytes_read;

  i2s_read(I2S_NUM_0, buffer, sizeof(buffer), &bytes_read, portMAX_DELAY);

  int samples = bytes_read / sizeof(int32_t);
  if (samples == 0) return 0;

  long long sum = 0;
  for (int i = 0; i < samples; i++) {
    int32_t sample = buffer[i] >> 14;
    sum += abs(sample);
  }

  return (int)(sum / samples);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

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
  if (millis() - lastSendTime < SEND_INTERVAL_MS) return;
  lastSendTime = millis();

  if (!readMPU()) {
    Serial.println("MPU read failed, skipping");
    return;
  }

  SensorPayload data = {};
  strncpy(data.nodeId, "node_02", sizeof(data.nodeId));
  data.accel_x     = accelX / 16384.0;
  data.accel_y     = accelY / 16384.0;
  data.accel_z     = accelZ / 16384.0;
  data.gyro_x      = gyroX / 131.0;
  data.gyro_y      = gyroY / 131.0;
  data.gyro_z      = gyroZ / 131.0;
  data.noise_level  = getNoiseLevel();
  data.distance_cm  = getDistanceCm();
  data.timestamp    = millis();

  Serial.printf("TX: ax=%.3f ay=%.3f az=%.3f gx=%.1f gy=%.1f gz=%.1f noise=%d dist=%.1f\n",
    data.accel_x, data.accel_y, data.accel_z,
    data.gyro_x, data.gyro_y, data.gyro_z,
    data.noise_level, data.distance_cm);

  esp_err_t result = esp_now_send(gatewayMAC, (uint8_t *)&data, sizeof(data));
  if (result != ESP_OK) {
    Serial.println("esp_now_send error");
  }
}
