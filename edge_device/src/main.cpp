#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "actuators/AlarmSystem.h"
#include "sensors/DropSensor.h"
#include "sensors/LoadCellSensor.h"
#include <time.h>
#include <sys/time.h>

// ============================================================================
// PIN DEFINITIONS & HARDWARE
// ============================================================================
// OLED Display (SW I2C)
#define OLED_SCL_PIN 7
#define OLED_SDA_PIN 4

// Servo Motor
#define SERVO_PIN 21
#define SERVO_MIN_ANGLE 0
#define SERVO_MAX_ANGLE 90

// Alarm System (Buzzer + LEDs)
#define BUZZER_PIN 6
#define LED_RED_PIN 10
#define LED_YELLOW_PIN 11
#define LED_GREEN_PIN 12

// IR Drop Sensor (LM393 comparator output -> interrupt pin)
// Theo DEMO_GUIDE_AND_STATE.md: chân ngắt dùng GPIO 5
#define DROP_SENSOR_PIN 5

// HX711 Load Cell Amplifier
// Theo DEMO_GUIDE_AND_STATE.md: DT = GPIO 18, SCK = GPIO 19
#define LOADCELL_DT_PIN 18
#define LOADCELL_SCK_PIN 19
// ⚠️ PHẢI hiệu chỉnh (calibrate) LOADCELL_CALIBRATION_FACTOR (sensors/LoadCellSensor.h)
// theo loadcell/túi dịch thực tế trước khi dùng số liệu volume_ml

const char* WIFI_SSID = "NDNH";
const char* WIFI_PASSWORD = "00112233";

const char* MQTT_SERVER = "172.20.10.5";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "ivdrip";
const char* MQTT_PASS = "ivdrip123";

const char* MQTT_TOPIC_TELEMETRY = "ivdrip/telemetry";
const char* MQTT_TOPIC_STATUS = "ivdrip/status";
const char* MQTT_TOPIC_CONTROL = "ivdrip/cmd";

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================
#define VOLUME_EMPTY_THRESHOLD_ML 10.0f
#define BPM_HIGH_THRESHOLD 80.0f
#define BPM_LOW_THRESHOLD 10.0f

#define TELEMETRY_INTERVAL_MS 2000
#define OLED_UPDATE_INTERVAL_MS 1000
#define SERVO_UPDATE_INTERVAL 500

// PID Controller Configuration
#define PID_KP 0.5f
#define PID_KI 0.05f
#define PID_KD 0.1f

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
// Network
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Hardware Objects
U8G2_SH1106_128X64_NONAME_F_SW_I2C display(U8G2_R0, OLED_SCL_PIN, OLED_SDA_PIN, U8X8_PIN_NONE);
Servo servoMotor;
AlarmSystem alarmSystem(LED_RED_PIN, LED_YELLOW_PIN, LED_GREEN_PIN, BUZZER_PIN);
DropSensor dropSensor(DROP_SENSOR_PIN);
LoadCellSensor loadCell(LOADCELL_DT_PIN, LOADCELL_SCK_PIN);

// System State
float currentVolume = 0.0f;
float currentBPM = 0.0f;
float targetBPM = 60.0f;
SafetyStatus currentSafetyStatus = STATUS_NORMAL;
int servoAngle = 45;
// false = đọc dữ liệu thật từ cảm biến (mặc định); true = nhận volume/bpm giả lập qua MQTT (dùng cho Simulator Panel khi chưa có phần cứng)
bool simulationMode = false;

// PID Variables
float pidError = 0;
float pidLastError = 0;
float pidIntegral = 0;
float pidDerivative = 0;

// Timing
uint32_t lastTelemetryTime = 0;
uint32_t lastOLEDUpdateTime = 0;
uint32_t lastServoUpdateTime = 0;
uint32_t lastMqttReconnectAttempt = 0;

// Function Prototypes
void setupWiFi();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void runEdgeAI();
SafetyStatus determineSafetyStatus(float bpm, float volume);
String getStatusString(SafetyStatus status);
void runPIDController();
void updateServo();
void updateOLED();
void publishTelemetry();

// ============================================================================
// SETUP FUNCTION
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n========================================");
    Serial.println("IV Drip AI Hub - Edge Firmware");
    Serial.println("========================================");
    
    // Initialize Hardware
    display.begin();
    
    servoMotor.setPeriodHertz(50);
    servoMotor.attach(SERVO_PIN, 500, 2500);
    servoMotor.write(servoAngle);
    alarmSystem.begin();
    alarmSystem.selfTest();

    // Initialize Sensors (real hardware)
    dropSensor.begin();
    dropSensor.setTargetBPM(targetBPM);
    if (!loadCell.begin(LOADCELL_CALIBRATION_FACTOR)) {
        Serial.println("[LoadCell] WARNING: Load cell not detected, volume will read 0 until fixed.");
    }

    // Network Setup
    setupWiFi();
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(1024);
    
    // Connect to MQTT
    reconnectMQTT();
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
    uint32_t currentTime = millis();
    
    // Non-blocking MQTT connection management
    if (!mqttClient.connected()) {
        if (currentTime - lastMqttReconnectAttempt > 5000) {
            lastMqttReconnectAttempt = currentTime;
            reconnectMQTT();
        }
    } else {
        mqttClient.loop();
    }
    
    // Sensor Acquisition + Control Loop (runs periodically regardless of MQTT traffic)
    if (currentTime - lastServoUpdateTime >= SERVO_UPDATE_INTERVAL) {
        if (!simulationMode) {
            // Real hardware readings
            currentBPM = dropSensor.getBPM();
            currentVolume = loadCell.getVolumeML();
        }
        // In simulationMode, currentBPM/currentVolume are instead fed by mqttCallback()
        runEdgeAI();
        runPIDController();
        updateServo();
        lastServoUpdateTime = currentTime;
    }
    
    // Update Alarm
    alarmSystem.updateStatus(currentSafetyStatus);
    alarmSystem.process();
    
    // Update UI
    if (currentTime - lastOLEDUpdateTime >= OLED_UPDATE_INTERVAL_MS) {
        updateOLED();
        lastOLEDUpdateTime = currentTime;
    }
    
    // OLED Recovery from Servo Brownouts
    static uint32_t lastOledRecovery = 0;
    if (currentTime - lastOledRecovery > 10000) {
        lastOledRecovery = currentTime;
        display.begin(); // Re-initialize to recover from power dips
    }
    
    // Send Telemetry
    if (currentTime - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
        publishTelemetry();
        lastTelemetryTime = currentTime;
    }
}

// ============================================================================
// NETWORK FUNCTIONS
// ============================================================================
void setupWiFi() {
    Serial.print("[WiFi] Connecting to ");
    Serial.println(WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    uint8_t attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected!");
        Serial.print("[WiFi] IP Address: ");
        Serial.println(WiFi.localIP());
        
        // Sync time via NTP
        Serial.println("[WiFi] Syncing NTP time...");
        configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
    } else {
        Serial.println("\n[WiFi] Failed to connect.");
    }
}

void reconnectMQTT() {
    if (WiFi.status() != WL_CONNECTED) return;
    
    Serial.print("[MQTT] Attempting connection...");
    
    String clientId = "IVDripHub_Sim_";
    clientId += String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println(" Connected!");
        mqttClient.subscribe(MQTT_TOPIC_CONTROL);
    } else {
        Serial.print(" Failed, rc=");
        Serial.println(mqttClient.state());
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, MQTT_TOPIC_CONTROL) == 0) {
        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, payload, length);
        
        if (error) {
            Serial.print("[MQTT] JSON Parse Error: ");
            Serial.println(error.c_str());
            return;
        }
        
        // Toggle between real sensor readings and simulated telemetry (from web Simulator Panel)
        if (doc.containsKey("simulation_mode")) {
            simulationMode = doc["simulation_mode"].as<bool>();
            Serial.printf("[Mode] simulationMode = %s\n", simulationMode ? "ON (fake sensors)" : "OFF (real sensors)");
        }
        // Simulated data only takes effect while simulationMode is active, so a real
        // sensor reading can never be silently overwritten by a stale/leftover command.
        if (simulationMode) {
            if (doc.containsKey("sim_volume")) {
                currentVolume = doc["sim_volume"].as<float>();
            }
            if (doc.containsKey("sim_bpm")) {
                currentBPM = doc["sim_bpm"].as<float>();
            }
        }
        if (doc.containsKey("target_bpm")) {
            targetBPM = doc["target_bpm"].as<float>();
            dropSensor.setTargetBPM(targetBPM);
        }
        if (doc.containsKey("servo_angle")) {
            // Manual override breaks PID deadlock
            servoAngle = doc["servo_angle"].as<int>();
            servoAngle = constrain(servoAngle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
            // reset PID integral so it doesn't fight the manual change instantly
            pidIntegral = 0;
            updateServo();
        }

        Serial.printf("[MQTT Cmd] Vol: %.1f, BPM: %.1f, Target: %.1f\n", currentVolume, currentBPM, targetBPM);
    }
}

// ============================================================================
// EDGE AI - SAFETY LOGIC
// ============================================================================
void runEdgeAI() {
    SafetyStatus newStatus = determineSafetyStatus(currentBPM, currentVolume);
    
    if (newStatus != currentSafetyStatus) {
        currentSafetyStatus = newStatus;
        if (mqttClient.connected()) {
            mqttClient.publish(MQTT_TOPIC_STATUS, getStatusString(newStatus).c_str());
        }
    }
}

SafetyStatus determineSafetyStatus(float bpm, float volume) {
    // Only evaluate alerts and alarms if the valve is actually open (> 20 degrees)
    if (servoAngle > 20) {
        // 1. Empty bag alert: if volume is low but still positive
        if (volume < VOLUME_EMPTY_THRESHOLD_ML && volume > 0.0f) {
            return STATUS_DANGER;
        }
        
        // 2. Blockage Alert: BPM = 0, but valve is open and bag has fluid
        if (bpm < 1.0f && volume > VOLUME_EMPTY_THRESHOLD_ML) {
            return STATUS_DANGER;
        }
        
        // 3. High/Low BPM Warnings
        if (bpm > BPM_HIGH_THRESHOLD) return STATUS_WARNING;
        if (bpm > 0.0f && bpm < BPM_LOW_THRESHOLD) return STATUS_WARNING;
        
        float lowerBound = targetBPM * 0.7f;
        float upperBound = targetBPM * 1.3f;
        if (bpm > 0.0f && (bpm < lowerBound || bpm > upperBound)) return STATUS_WARNING;
    }
    
    // If the valve is closed (servoAngle <= 20), no alarms should sound
    return STATUS_NORMAL;
}

String getStatusString(SafetyStatus status) {
    switch (status) {
        case STATUS_NORMAL: return "normal";
        case STATUS_DANGER: return "danger";
        case STATUS_WARNING: return "warning";
        default: return "unknown";
    }
}

// ============================================================================
// PID CONTROLLER
// ============================================================================
void runPIDController() {
    // If the system is in DANGER (blockage or empty), freeze the PID to prevent windup
    if (currentSafetyStatus == STATUS_DANGER) {
        pidError = 0; pidIntegral = 0; pidDerivative = 0; pidLastError = 0;
        return;
    }
    
    if (currentBPM < 1.0f || targetBPM <= 0) {
        pidError = 0; pidIntegral = 0; pidDerivative = 0; pidLastError = 0;
        return;
    }
    
    pidError = targetBPM - currentBPM;
    float P = PID_KP * pidError;
    
    pidIntegral += pidError;
    // Constrain integral to a tighter range to prevent massive windup oscillations
    pidIntegral = constrain(pidIntegral, -30.0f, 30.0f);
    float I = PID_KI * pidIntegral;
    
    pidDerivative = pidError - pidLastError;
    float D = PID_KD * pidDerivative;
    
    pidLastError = pidError;
    float output = P + I + D;
    
    int angleAdjustment = (int)(output * 0.5f);
    angleAdjustment = constrain(angleAdjustment, -10, 10);
    
    servoAngle += angleAdjustment;
    servoAngle = constrain(servoAngle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
}

void updateServo() {
    servoMotor.write(servoAngle);
}

// ============================================================================
// OLED DISPLAY
// ============================================================================
void updateOLED() {
    display.clearBuffer();
    display.setFont(u8g2_font_6x10_tf);
    
    int y = 10;
    
    // Header
    display.setCursor(0, y);
    display.print(simulationMode ? "SIM HUB " : "SENSOR HUB ");
    switch (currentSafetyStatus) {
        case STATUS_NORMAL:  display.print("[OK]"); break;
        case STATUS_WARNING: display.print("[WARN]"); break;
        case STATUS_DANGER:  display.print("[DANGER]"); break;
    }
    y += 10;
    
    display.drawStr(0, y, "---------------------");
    y += 10;
    
    // Volume
    display.setCursor(0, y);
    display.print("Volume: "); display.print(currentVolume, 1); display.print(" mL");
    y += 10;
    
    // BPM
    display.setCursor(0, y);
    display.print("BPM: "); display.print(currentBPM, 1);
    display.print("/"); display.print(targetBPM, 0); display.print(" tgt");
    y += 10;
    
    // Valve
    display.setCursor(0, y);
    display.print("Valve: "); display.print(servoAngle); display.print(" deg");
    y += 10;
    
    // WiFi / MQTT
    display.setCursor(0, y);
    display.print("Wi:"); display.print(WiFi.RSSI());
    display.print(" MQ:"); display.print(mqttClient.connected() ? "OK" : "NO");
    
    display.sendBuffer();
}

// ============================================================================
// MQTT TELEMETRY
// ============================================================================
void publishTelemetry() {
    if (!mqttClient.connected()) return;
    
    StaticJsonDocument<512> doc;
    doc["device_id"] = "iv_drip_01";
    doc["volume_ml"] = currentVolume;
    doc["bpm"] = currentBPM;
    doc["target_bpm"] = targetBPM;
    doc["servo_angle"] = servoAngle;
    doc["status"] = getStatusString(currentSafetyStatus);
    doc["rssi"] = WiFi.RSSI();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["uptime_ms"] = millis();
    
    struct timeval tv;
    gettimeofday(&tv, NULL);
    uint64_t timestamp_ms = (uint64_t)(tv.tv_sec) * 1000ULL + (uint64_t)(tv.tv_usec) / 1000ULL;
    // Fallback if NTP not synced yet (time near 1970)
    if (tv.tv_sec < 1000000000) {
        doc["timestamp"] = millis();
    } else {
        doc["timestamp"] = timestamp_ms;
    }
    
    char buffer[512];
    size_t n = serializeJson(doc, buffer, sizeof(buffer));
    mqttClient.publish(MQTT_TOPIC_TELEMETRY, buffer);
}