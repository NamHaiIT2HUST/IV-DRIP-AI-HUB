#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "actuators/AlarmSystem.h"

// ============================================================================
// PIN DEFINITIONS & HARDWARE (NO PHYSICAL SENSORS)
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

const char* WIFI_SSID = "IVDRIP";
const char* WIFI_PASSWORD = "12345678";

const char* MQTT_SERVER = "192.168.137.1";
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

// System State (SIMULATED ONLY)
float currentVolume = 0.0f;
float currentBPM = 0.0f;
float targetBPM = 60.0f;
SafetyStatus currentSafetyStatus = STATUS_NORMAL;
int servoAngle = 45;

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
    Serial.println("IV Drip AI Hub - Pure Web Simulator");
    Serial.println("========================================");
    
    // Initialize Hardware
    display.begin();
    
    servoMotor.setPeriodHertz(50);
    servoMotor.attach(SERVO_PIN, 500, 2500);
    servoMotor.write(servoAngle);
    alarmSystem.begin();
    alarmSystem.selfTest();
    
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
    
    // Update Control Loop
    if (currentTime - lastServoUpdateTime >= SERVO_UPDATE_INTERVAL) {
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
        
        // Parse simulated data directly into system state
        if (doc.containsKey("sim_volume")) {
            currentVolume = doc["sim_volume"].as<float>();
        }
        if (doc.containsKey("sim_bpm")) {
            currentBPM = doc["sim_bpm"].as<float>();
        }
        
        Serial.printf("[Simulator] Data received -> Vol: %.1f, BPM: %.1f\n", currentVolume, currentBPM);
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
    if (volume < VOLUME_EMPTY_THRESHOLD_ML && volume > 0) return STATUS_DANGER;
    if (bpm < 1.0f && volume > VOLUME_EMPTY_THRESHOLD_ML) return STATUS_DANGER;
    if (bpm > BPM_HIGH_THRESHOLD) return STATUS_WARNING;
    if (bpm > 0 && bpm < BPM_LOW_THRESHOLD) return STATUS_WARNING;
    
    float lowerBound = targetBPM * 0.7f;
    float upperBound = targetBPM * 1.3f;
    if (bpm > 0 && (bpm < lowerBound || bpm > upperBound)) return STATUS_WARNING;
    
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
    if (currentBPM < 1.0f || targetBPM <= 0) {
        pidError = 0; pidIntegral = 0; pidDerivative = 0; pidLastError = 0;
        return;
    }
    
    pidError = targetBPM - currentBPM;
    float P = PID_KP * pidError;
    
    pidIntegral += pidError;
    pidIntegral = constrain(pidIntegral, -100.0f, 100.0f);
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
    display.print("SIMULATOR HUB ");
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
    doc["timestamp"] = millis();
    
    char buffer[512];
    size_t n = serializeJson(doc, buffer, sizeof(buffer));
    mqttClient.publish(MQTT_TOPIC_TELEMETRY, buffer);
}