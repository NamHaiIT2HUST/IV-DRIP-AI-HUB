/**
 * @file main.cpp
 * @brief AI-Driven Numerical IV Drip Hub - Main Orchestrator
 * 
 * This is the main firmware for the ESP32-S3 based IV drip monitoring system.
 * It coordinates all sensors, actuators, and communication:
 * - Reads load cell for IV volume monitoring
 * - Counts drops via IR sensor interrupt for BPM calculation
 * - Controls servo motor via PID algorithm for drip rate adjustment
 * - Displays real-time data on OLED screen
 * - Streams telemetry via MQTT to backend
 * - Runs local Edge AI safety logic
 * - Manages alarms (LEDs & Buzzer)
 * 
 * Clean Architecture: Dependency Rule, Single Responsibility
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// Local includes
#include "sensors/LoadCellSensor.h"
#include "sensors/DropSensor.h"
#include "actuators/AlarmSystem.h"

// ============================================================================
// PIN DEFINITIONS
// ============================================================================

// Load Cell (HX711)
#define HX711_DT_PIN 18
#define HX711_SCK_PIN 19

// IR Drop Sensor
#define DROP_SENSOR_PIN 5  // GPIO5 with hardware interrupt

// Servo Motor
#define SERVO_PIN 21

// OLED Display (I2C)
#define OLED_SDA_PIN 17
#define OLED_SCL_PIN 16
#define OLED_RESET_PIN -1
#define OLED_ADDRESS 0x3C

// Alarm System
#define LED_RED_PIN 25
#define LED_YELLOW_PIN 26
#define LED_GREEN_PIN 27
#define BUZZER_PIN 33

// Potentiometer (Manual Override)
#define POT_PIN 34  // ADC1_GPIO34

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_SERVER = "192.168.1.100";
const uint16_t MQTT_PORT = 1883;
const char* MQTT_USER = "ivdrip";
const char* MQTT_PASS = "ivdrip123";

const char* MQTT_TOPIC_TELEMETRY = "ivdrip/telemetry";
const char* MQTT_TOPIC_STATUS = "ivdrip/status";
const char* MQTT_TOPIC_CONTROL = "ivdrip/control";

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

// PID Controller parameters
#define PID_KP 2.0f     // Proportional gain
#define PID_KI 0.1f     // Integral gain
#define PID_KD 0.5f     // Derivative gain

// Servo constraints
#define SERVO_MIN_ANGLE 0
#define SERVO_MAX_ANGLE 90
#define SERVO_UPDATE_INTERVAL 500  // ms between servo adjustments

// Target BPM (drops per minute)
#define TARGET_BPM 60.0f

// Safety thresholds
#define VOLUME_EMPTY_THRESHOLD_ML 10.0f    // Alert when below this
#define BPM_HIGH_THRESHOLD 120.0f           // Too fast
#define BPM_LOW_THRESHOLD 20.0f             // Too slow (possible clog)

// Telemetry interval
#define TELEMETRY_INTERVAL_MS 2000  // Send data every 2 seconds
#define OLED_UPDATE_INTERVAL_MS 500 // Update display every 500ms

// ============================================================================
// GLOBAL OBJECTS
// ============================================================================

// Sensors
LoadCellSensor loadCell(HX711_DT_PIN, HX711_SCK_PIN);
DropSensor dropSensor(DROP_SENSOR_PIN);

// Actuators
AlarmSystem alarmSystem(LED_RED_PIN, LED_YELLOW_PIN, LED_GREEN_PIN, BUZZER_PIN);
Servo servoMotor;

// Display
Adafruit_SSD1306 display(OLED_RESET_PIN);

// MQTT
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// System state
SafetyStatus currentSafetyStatus = STATUS_NORMAL;
float targetBPM = TARGET_BPM;
float currentBPM = 0.0f;
float currentVolume = 0.0f;
int servoAngle = 45;  // Start at mid-position

// PID variables
float pidError = 0.0f;
float pidIntegral = 0.0f;
float pidDerivative = 0.0f;
float pidLastError = 0.0f;

// Timing
uint32_t lastTelemetryTime = 0;
uint32_t lastOLEDUpdateTime = 0;
uint32_t lastServoUpdateTime = 0;
uint32_t lastReconnectTime = 0;

// ============================================================================
// FUNCTION DECLARATIONS
// ============================================================================

void setupWiFi();
void setupMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void reconnectMQTT();
void readSensors();
void runEdgeAI();
void runPIDController();
void updateServo();
void updateOLED();
void publishTelemetry();
void processControlCommands();
SafetyStatus determineSafetyStatus(float bpm, float volume);
String getStatusString(SafetyStatus status);

// ============================================================================
// SETUP
// ============================================================================

void setup() {
    Serial.begin(115200);
    Serial.println("\n========================================");
    Serial.println("IV Drip AI Hub - ESP32-S3 Firmware");
    Serial.println("========================================\n");
    
    // Initialize I2C for OLED
    Wire.begin(OLED_SDA_PIN, OLED_SCL_PIN);
    
    // Initialize OLED display
    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
        Serial.println("[OLED] ERROR: Display initialization failed!");
        while (1) delay(1000);
    }
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("IV Drip Hub Starting...");
    display.display();
    
    // Initialize servo
    servoMotor.attach(SERVO_PIN);
    servoMotor.write(servoAngle);
    Serial.println("[Servo] Initialized");
    
    // Initialize load cell sensor
    if (!loadCell.begin()) {
        Serial.println("[LoadCell] Initialization failed - continuing without");
    }
    
    // Initialize drop sensor
    if (!dropSensor.begin()) {
        Serial.println("[DropSensor] Initialization failed!");
    }
    dropSensor.setTargetBPM(targetBPM);
    
    // Initialize alarm system
    alarmSystem.begin();
    alarmSystem.selfTest();
    
    // Initialize WiFi
    setupWiFi();
    
    // Initialize MQTT
    setupMQTT();
    
    display.clearDisplay();
    display.println("System Ready!");
    display.display();
    
    Serial.println("\n[System] Initialization complete!");
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
    uint32_t currentTime = millis();
    
    // Maintain MQTT connection
    if (!mqttClient.connected()) {
        reconnectMQTT();
    }
    mqttClient.loop();
    
    // Read sensors
    readSensors();
    
    // Run Edge AI safety logic
    runEdgeAI();
    
    // Run PID controller for servo
    runPIDController();
    
    // Update servo position
    if (currentTime - lastServoUpdateTime >= SERVO_UPDATE_INTERVAL) {
        updateServo();
        lastServoUpdateTime = currentTime;
    }
    
    // Update alarm system
    alarmSystem.updateStatus(currentSafetyStatus);
    alarmSystem.process();
    
    // Update OLED display
    if (currentTime - lastOLEDUpdateTime >= OLED_UPDATE_INTERVAL_MS) {
        updateOLED();
        lastOLEDUpdateTime = currentTime;
    }
    
    // Publish telemetry
    if (currentTime - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
        publishTelemetry();
        lastTelemetryTime = currentTime;
    }
    
    // Small delay to prevent watchdog issues
    delay(10);
}

// ============================================================================
// NETWORK FUNCTIONS
// ============================================================================

void setupWiFi() {
    Serial.print("[WiFi] Connecting to ");
    Serial.println(WIFI_SSID);
    
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    uint8_t attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi] Connected!");
        Serial.print("[WiFi] IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\n[WiFi] Connection failed!");
    }
}

void setupMQTT() {
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    
    Serial.print("[MQTT] Connecting to ");
    Serial.print(MQTT_SERVER);
    Serial.print(":");
    Serial.println(MQTT_PORT);
    
    reconnectMQTT();
}

void reconnectMQTT() {
    uint32_t currentTime = millis();
    
    // Rate limit reconnection attempts
    if (currentTime - lastReconnectTime < 5000) {
        return;
    }
    lastReconnectTime = currentTime;
    
    if (mqttClient.connect("ESP32_IVDrip_Hub", MQTT_USER, MQTT_PASS)) {
        Serial.println("[MQTT] Connected!");
        
        // Subscribe to control topic
        if (mqttClient.subscribe(MQTT_TOPIC_CONTROL)) {
            Serial.println("[MQTT] Subscribed to control topic");
        }
        
        // Publish online status
        mqttClient.publish(MQTT_TOPIC_STATUS, "online");
    } else {
        Serial.print("[MQTT] Connection failed, rc=");
        Serial.println(mqttClient.state());
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // Convert topic to string
    char topicBuffer[64];
    strncpy(topicBuffer, topic, sizeof(topicBuffer) - 1);
    topicBuffer[sizeof(topicBuffer) - 1] = '\0';
    
    // Convert payload to string
    char payloadBuffer[length + 1];
    memcpy(payloadBuffer, payload, length);
    payloadBuffer[length] = '\0';
    
    Serial.print("[MQTT] Received on ");
    Serial.print(topicBuffer);
    Serial.print(": ");
    Serial.println(payloadBuffer);
    
    // Parse JSON command
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payloadBuffer);
    
    if (error) {
        Serial.println("[MQTT] JSON parse error");
        return;
    }
    
    // Process control commands
    if (strcmp(topicBuffer, MQTT_TOPIC_CONTROL) == 0) {
        if (doc.containsKey("target_bpm")) {
            targetBPM = doc["target_bpm"].as<float>();
            dropSensor.setTargetBPM(targetBPM);
            Serial.print("[Control] Target BPM set to: ");
            Serial.println(targetBPM);
        }
        
        if (doc.containsKey("servo_angle")) {
            int angle = doc["servo_angle"].as<int>();
            servoAngle = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
            servoMotor.write(servoAngle);
            Serial.print("[Control] Servo angle set to: ");
            Serial.println(servoAngle);
        }
        
        if (doc.containsKey("alarm_silence")) {
            if (doc["alarm_silence"].as<bool>()) {
                alarmSystem.silence();
                Serial.println("[Control] Alarm silenced");
            }
        }
    }
}

// ============================================================================
// SENSOR FUNCTIONS
// ============================================================================

void readSensors() {
    // Read volume from load cell
    currentVolume = loadCell.getVolumeML();
    
    // Read BPM from drop sensor
    currentBPM = dropSensor.getBPM();
    
    // Log sensor readings (debug)
    static uint32_t lastLogTime = 0;
    if (millis() - lastLogTime >= 5000) {
        Serial.printf("[Sensors] Volume: %.1f mL, BPM: %.1f\n", currentVolume, currentBPM);
        lastLogTime = millis();
    }
}

// ============================================================================
// EDGE AI - SAFETY LOGIC
// ============================================================================

void runEdgeAI() {
    SafetyStatus newStatus = determineSafetyStatus(currentBPM, currentVolume);
    
    // Status change detection
    if (newStatus != currentSafetyStatus) {
        Serial.print("[EdgeAI] Status changed: ");
        Serial.print(getStatusString(currentSafetyStatus));
        Serial.print(" -> ");
        Serial.println(getStatusString(newStatus));
        
        currentSafetyStatus = newStatus;
        
        // Publish status change
        mqttClient.publish(MQTT_TOPIC_STATUS, getStatusString(newStatus).c_str());
    }
}

SafetyStatus determineSafetyStatus(float bpm, float volume) {
    // Check for dangerous conditions first
    
    // Empty bag detection
    if (volume < VOLUME_EMPTY_THRESHOLD_ML && volume > 0) {
        return STATUS_DANGER;  // Bag is nearly empty
    }
    
    // No flow detected (possible clog or disconnection)
    if (bpm < 1.0f && volume > VOLUME_EMPTY_THRESHOLD_ML) {
        // Only trigger if we previously had flow
        static bool hadFlow = false;
        if (hadFlow) {
            return STATUS_DANGER;  // Flow stopped unexpectedly
        }
    }
    
    // Track if we had flow
    if (bpm >= 1.0f) {
        static bool hadFlow = true;
    }
    
    // Check for abnormal BPM
    if (bpm > BPM_HIGH_THRESHOLD) {
        return STATUS_WARNING;  // Drip too fast
    }
    
    if (bpm > 0 && bpm < BPM_LOW_THRESHOLD) {
        return STATUS_WARNING;  // Drip too slow (but not stopped)
    }
    
    // Check if BPM is within acceptable range of target
    if (!dropSensor.isWithinTargetRange(30.0f)) {  // ±30% tolerance
        if (bpm > 0) {
            return STATUS_WARNING;
        }
    }
    
    // All parameters normal
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
    // Only run PID if we have valid BPM readings and target
    if (currentBPM < 1.0f || targetBPM <= 0) {
        pidError = 0;
        pidIntegral = 0;
        pidDerivative = 0;
        pidLastError = 0;
        return;
    }
    
    // Calculate error (target - current)
    pidError = targetBPM - currentBPM;
    
    // Proportional term
    float P = PID_KP * pidError;
    
    // Integral term (with anti-windup)
    pidIntegral += pidError;
    pidIntegral = constrain(pidIntegral, -100.0f, 100.0f);  // Anti-windup
    float I = PID_KI * pidIntegral;
    
    // Derivative term
    pidDerivative = pidError - pidLastError;
    float D = PID_KD * pidDerivative;
    
    pidLastError = pidError;
    
    // Calculate output
    float output = P + I + D;
    
    // Map output to servo angle adjustment
    // Positive output = increase angle (open valve more = faster drip)
    // Negative output = decrease angle (close valve = slower drip)
    
    int angleAdjustment = (int)(output * 0.5f);  // Scale factor
    angleAdjustment = constrain(angleAdjustment, -10, 10);  // Limit adjustment per cycle
    
    servoAngle += angleAdjustment;
    servoAngle = constrain(servoAngle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
    
    // Debug output
    static uint32_t lastPIDLog = 0;
    if (millis() - lastPIDLog >= 5000) {
        Serial.printf("[PID] Error: %.1f, Output: %d, Angle: %d\n", 
                      pidError, angleAdjustment, servoAngle);
        lastPIDLog = millis();
    }
}

void updateServo() {
    servoMotor.write(servoAngle);
}

// ============================================================================
// OLED DISPLAY
// ============================================================================

void updateOLED() {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    
    // Header with status indicator
    display.print("IV Drip Hub  ");
    switch (currentSafetyStatus) {
        case STATUS_NORMAL:
            display.println("[OK]");
            break;
        case STATUS_WARNING:
            display.println("[WARN]");
            break;
        case STATUS_DANGER:
            display.println("[DANGER]");
            break;
    }
    
    display.println("--------------------");
    
    // Volume display
    display.print("Volume: ");
    display.print(currentVolume, 1);
    display.println(" mL");
    
    // BPM display
    display.print("BPM: ");
    display.print(currentBPM, 1);
    display.print(" / ");
    display.print(targetBPM, 0);
    display.println(" tgt");
    
    // Servo angle
    display.print("Valve: ");
    display.print(servoAngle);
    display.println(" deg");
    
    // WiFi signal
    display.print("WiFi: ");
    display.print(WiFi.RSSI());
    display.println(" dBm");
    
    // Status bar
    display.println("--------------------");
    display.print("MQTT: ");
    display.println(mqttClient.connected() ? "OK" : "DISC");
    
    display.display();
}

// ============================================================================
// MQTT TELEMETRY
// ============================================================================

void publishTelemetry() {
    if (!mqttClient.connected()) return;
    
    // Create JSON payload
    StaticJsonDocument<512> doc;
    
    // Sensor data
    doc["volume_ml"] = currentVolume;
    doc["bpm"] = currentBPM;
    doc["target_bpm"] = targetBPM;
    
    // Device state
    doc["servo_angle"] = servoAngle;
    doc["status"] = getStatusString(currentSafetyStatus);
    
    // Additional metrics
    doc["rssi"] = WiFi.RSSI();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["uptime_ms"] = millis();
    
    // Timestamp
    doc["timestamp"] = millis();
    
    // Serialize and publish
    char buffer[512];
    size_t n = serializeJson(doc, buffer, sizeof(buffer));
    
    if (mqttClient.publish(MQTT_TOPIC_TELEMETRY, buffer)) {
        Serial.printf("[MQTT] Published telemetry (%d bytes)\n", n);
    } else {
        Serial.println("[MQTT] Failed to publish telemetry");
    }
}

void processControlCommands() {
    // Control commands are handled in mqttCallback
}