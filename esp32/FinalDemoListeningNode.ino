#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <driver/i2s.h>
#include <math.h>
#include <string.h>
#include <esp_task_wdt.h>

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

// Watchdog timeout in seconds — if loop() blocks longer than this, the board reboots
#define WDT_TIMEOUT_S 15

const unsigned long SEND_INTERVAL_MS = 2000;
const unsigned long LINK_TIMEOUT_MS = 10000;
unsigned long lastSendTime = 0;
unsigned long lastGatewayContactTime = 0;

// Debug: track loop iterations and timing
unsigned long loopCount = 0;
unsigned long lastHeapReport = 0;

uint8_t gatewayMAC[] = {0x6C, 0xC8, 0x40, 0x77, 0x6D, 0x0C};

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

    bool ledColorChanged = strncmp(currentLedColor, incoming.led_color, sizeof(currentLedColor)) != 0;

    strncpy(currentLedColor, incoming.led_color, sizeof(currentLedColor) - 1);
    currentLedColor[sizeof(currentLedColor) - 1] = '\0';

    ledColorReceived = true;
    lastGatewayContactTime = millis();

    if (ledColorChanged) {
      Serial.print("Received led_color: ");
      Serial.println(currentLedColor);
    }
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

  esp_err_t err = i2s_driver_install(I2S_NUM_0, &i2s_config, 0, NULL);
  Serial.printf("[DEBUG] I2S driver install: %s\n", esp_err_to_name(err));

  err = i2s_set_pin(I2S_NUM_0, &pin_config);
  Serial.printf("[DEBUG] I2S set pin: %s\n", esp_err_to_name(err));
}

// --- I2C bus recovery: clocks SCL manually to release a stuck SDA line ---
void recoverI2C() {
  Serial.println("[DEBUG] Attempting I2C bus recovery...");
  Wire.end();

  // Manually clock SCL to release a stuck SDA
  pinMode(MPU_SCL, OUTPUT);
  pinMode(MPU_SDA, INPUT);
  for (int i = 0; i < 16; i++) {
    digitalWrite(MPU_SCL, HIGH);
    delayMicroseconds(5);
    digitalWrite(MPU_SCL, LOW);
    delayMicroseconds(5);
  }

  // Re-init I2C
  Wire.begin(MPU_SDA, MPU_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(100);
  delay(50);
  Serial.println("[DEBUG] I2C bus recovered");
}

bool setupMPU() {
  Wire.begin(MPU_SDA, MPU_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(100);  // 100ms timeout to prevent I2C hangs
  delay(100);

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  uint8_t result = Wire.endTransmission(true);
  Serial.printf("[DEBUG] MPU init endTransmission: %u\n", result);
  return result == 0;
}

bool readMPU() {
  unsigned long start = millis();

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  uint8_t txStatus = Wire.endTransmission(false);
  if (txStatus != 0) {
    Serial.printf("[DEBUG] MPU tx failed: %u (took %lu ms)\n", txStatus, millis() - start);
    recoverI2C();
    return false;
  }

  uint8_t count = Wire.requestFrom(MPU_ADDR, (uint8_t)14);
  if (count < 14) {
    Serial.printf("[DEBUG] MPU requestFrom got %u bytes (took %lu ms)\n", count, millis() - start);
    recoverI2C();
    return false;
  }

  accelX = (Wire.read() << 8) | Wire.read();
  accelY = (Wire.read() << 8) | Wire.read();
  accelZ = (Wire.read() << 8) | Wire.read();
  temperatureRaw = (Wire.read() << 8) | Wire.read();
  gyroX = (Wire.read() << 8) | Wire.read();
  gyroY = (Wire.read() << 8) | Wire.read();
  gyroZ = (Wire.read() << 8) | Wire.read();

  Serial.printf("[DEBUG] MPU read OK (%lu ms)\n", millis() - start);
  return true;
}

float getDistanceCm() {
  unsigned long start = millis();

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  Serial.printf("[DEBUG] Ultrasonic: duration=%ld us (took %lu ms)\n", duration, millis() - start);

  if (duration == 0) return -1.0;

  return duration * 0.0343 / 2.0;
}

float getNoiseDb() {
  static float smoothedDb = 0.0f;
  static bool initialized = false;
  static int32_t buffer[256];

  unsigned long start = millis();
  size_t bytes_read = 0;

  // --- Drain stale DMA buffers so we read fresh audio ---
  int drainCount = 0;
  while (drainCount < 16) {
    esp_err_t err = i2s_read(I2S_NUM_0, buffer, sizeof(buffer), &bytes_read, 0);  // non-blocking
    if (err != ESP_OK || bytes_read == 0) break;
    drainCount++;
  }
  Serial.printf("[DEBUG] I2S drained %d stale buffers (%lu ms)\n", drainCount, millis() - start);

  // --- Now read one fresh buffer with a short timeout ---
  esp_err_t err = i2s_read(I2S_NUM_0, buffer, sizeof(buffer), &bytes_read, pdMS_TO_TICKS(200));
  if (err != ESP_OK || bytes_read == 0) {
    Serial.printf("[DEBUG] I2S fresh read failed: err=%s bytes=%u (%lu ms)\n",
                  esp_err_to_name(err), bytes_read, millis() - start);
    return initialized ? smoothedDb : 0.0f;
  }

  int samples = bytes_read / sizeof(int32_t);
  if (samples == 0) {
    Serial.printf("[DEBUG] I2S 0 samples (%lu ms)\n", millis() - start);
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

  Serial.printf("[DEBUG] I2S noise: %.2f dB, %d samples (%lu ms)\n", smoothedDb, samples, millis() - start);
  return smoothedDb;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========== SENSOR NODE BOOT ==========");
  Serial.printf("[DEBUG] Free heap at boot: %u bytes\n", ESP.getFreeHeap());
  Serial.printf("[DEBUG] CPU freq: %u MHz\n", ESP.getCpuFreqMHz());

  // --- Watchdog setup (new API for ESP-IDF 5.x / Arduino ESP32 core 3.x) ---
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT_S * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);  // add current task (loopTask)
  Serial.printf("[DEBUG] Watchdog enabled: %d second timeout\n", WDT_TIMEOUT_S);

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

  // Give the radio time to fully initialize
  delay(100);

  const uint8_t GATEWAY_CHANNEL = 6;
  esp_wifi_set_channel(GATEWAY_CHANNEL, WIFI_SECOND_CHAN_NONE);

  Serial.print("Sensor node MAC: ");
  Serial.println(WiFi.macAddress());

  // If MAC is all zeros, the WiFi radio didn't start properly
  if (WiFi.macAddress() == "00:00:00:00:00:00") {
    Serial.println("[WARN] WiFi MAC is null — radio may not be initialized properly");
  }

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

  Serial.printf("[DEBUG] Free heap after setup: %u bytes\n", ESP.getFreeHeap());
  Serial.println("Sensor node ready.\n");
}

void loop() {
  // --- Feed the watchdog every loop iteration ---
  esp_task_wdt_reset();

  // --- Periodic heap/status report every 10 seconds ---
  if (millis() - lastHeapReport >= 10000) {
    lastHeapReport = millis();
    Serial.printf("[HEALTH] loop=%lu uptime=%lu ms heap=%u minHeap=%u\n",
                  loopCount, millis(), ESP.getFreeHeap(), ESP.getMinFreeHeap());
  }

  if (millis() - lastSendTime < SEND_INTERVAL_MS) {
    updateLeds();
    delay(10);
    return;
  }

  lastSendTime = millis();
  loopCount++;

  unsigned long cycleStart = millis();
  Serial.printf("\n--- Cycle %lu ---\n", loopCount);

  // --- MPU read with debug ---
  Serial.println("[DEBUG] Reading MPU...");
  unsigned long stepStart = millis();
  bool mpuOk = readMPU();
  if (!mpuOk) {
    Serial.println("[DEBUG] MPU retry...");
    delay(5);
    mpuOk = readMPU();
  }
  if (!mpuOk) {
    Serial.println("[WARN] MPU read failed, using previous values");
  }
  Serial.printf("[DEBUG] MPU step total: %lu ms\n", millis() - stepStart);

  // --- Noise read with debug ---
  Serial.println("[DEBUG] Reading noise...");
  stepStart = millis();
  float noiseDb = getNoiseDb();
  Serial.printf("[DEBUG] Noise step total: %lu ms\n", millis() - stepStart);

  // --- Distance read with debug ---
  Serial.println("[DEBUG] Reading distance...");
  stepStart = millis();
  float distCm = getDistanceCm();
  Serial.printf("[DEBUG] Distance step total: %lu ms\n", millis() - stepStart);

  // --- Build and send payload ---
  SensorPayload data = {};
  strncpy(data.nodeId, "node_01", sizeof(data.nodeId));
  data.accel_x = accelX / 16384.0;
  data.accel_y = accelY / 16384.0;
  data.accel_z = accelZ / 16384.0;
  data.gyro_x = gyroX / 131.0;
  data.gyro_y = gyroY / 131.0;
  data.gyro_z = gyroZ / 131.0;
  data.noise_db = noiseDb;
  data.distance_cm = distCm;
  data.timestamp = millis();

  updateLeds();

  Serial.printf("TX: ax=%.3f ay=%.3f az=%.3f gx=%.1f gy=%.1f gz=%.1f noise_db=%.2f dist=%.1f led_color=%s\n",
    data.accel_x, data.accel_y, data.accel_z,
    data.gyro_x, data.gyro_y, data.gyro_z,
    data.noise_db, data.distance_cm,
    ledColorReceived ? currentLedColor : "unknown");

  Serial.println("[DEBUG] Sending ESP-NOW...");
  stepStart = millis();
  esp_err_t result = esp_now_send(gatewayMAC, (uint8_t *)&data, sizeof(data));
  if (result != ESP_OK) {
    Serial.printf("[ERROR] esp_now_send: %s\n", esp_err_to_name(result));
  }
  Serial.printf("[DEBUG] Send step: %lu ms\n", millis() - stepStart);

  Serial.printf("[DEBUG] Full cycle: %lu ms | heap: %u\n", millis() - cycleStart, ESP.getFreeHeap());
}
