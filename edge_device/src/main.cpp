#include <Arduino.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Nhúng các Module của Kỹ sư trưởng Nam Hải
#include "sensors/LoadCellSensor.h"
#include "sensors/DropSensor.h"
#include "actuators/AlarmSystem.h"

// --- KHAI BÁO MÀN HÌNH & ĐỘNG CƠ ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

Servo valveServo;
const int SERVO_PIN = 18;     
const int POT_PIN = 4;        

// --- KHAI BÁO CÁC MODULE OOP ---
LoadCellSensor ivScale(5, 6, 420.0);       // HX711: DOUT=5, SCK=6
DropSensor irSensor(2);                    // IR Sensor: GPIO 2
AlarmSystem alarm(12, 13, 14, 27);         // Đỏ=12, Vàng=13, Xanh=14, Còi=27

// --- KHAI BÁO MẠNG VÀ MQTT ---
const char* ssid = "Tang3";        
const char* password = "23092005";
const char* mqtt_server = "192.168.1.103";     
const char* device_id = "ESP_01";          

WiFiClient espClient;
PubSubClient client(espClient);

// --- CÁC BIẾN TOÀN CỤC ---
float targetRate = 45.0;      
float valveAngle = 90.0;      
int aiStatus = 0; // 0: Bình thường, 1: Nguy hiểm, 2: Cảnh báo
long lastTelemetryTime = 0;

void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<128> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (!error && doc.containsKey("target_rate")) {
        targetRate = doc["target_rate"];
        Serial.printf("🔔 Lệnh phác đồ mới: %.1f bpm\n", targetRate);
    }
}

void setup_wifi() {
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(500); }
    Serial.println("WiFi OK!");
}

void reconnect() {
    while (!client.connected()) {
        if (client.connect(device_id)) {
            char command_topic[50];
            sprintf(command_topic, "hospital/command/%s", device_id);
            client.subscribe(command_topic);
        } else {
            delay(3000);
        }
    }
}

void setup() {
    Serial.begin(115200);

    ESP32PWM::allocateTimer(0);
    valveServo.setPeriodHertz(50);
    valveServo.attach(SERVO_PIN, 500, 2400);

    display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
    display.setTextColor(WHITE);

    // Khởi động các Module
    ivScale.begin();
    irSensor.begin();
    alarm.begin();

    setup_wifi();
    client.setServer(mqtt_server, 1883);
    client.setCallback(mqtt_callback);
}

void loop() {
    if (!client.connected()) reconnect();
    client.loop();

    // 1. Cập nhật dữ liệu từ Cảm biến
    irSensor.update(); // Chống kẹt giọt
    float currentRate = irSensor.getBPM(); // Lấy BPM thật từ giọt nước
    float currentVolume = ivScale.getVolume(); // Lấy gram/ml từ Loadcell

    // 2. Thuật toán PID (Dùng tay vặn biến trở để mô phỏng tạm)
    int rawADC = analogRead(POT_PIN);
    valveAngle = map(rawADC, 0, 4095, 0, 180);
    valveServo.write(valveAngle);

    // 3. Logic AI Edge Cảnh báo (Phản ứng tức thì không chờ Server)
    if (currentVolume >= 0 && currentVolume < 50.0) {
        aiStatus = 1; // Hết dịch -> Nguy hiểm (Status 1)
    } else if (currentRate == 0.0) {
        aiStatus = 1; // Tắc kim -> Nguy hiểm (Status 1)
    } else if (currentRate > targetRate * 1.5) {
        aiStatus = 2; // Chảy quá nhanh -> Cảnh báo (Status 2)
    } else {
        aiStatus = 0; // Bình thường
    }

    // 4. Kích hoạt Loa & Đèn theo AI Status
    if (aiStatus == 1) alarm.setDanger();
    else if (aiStatus == 2) alarm.setWarning();
    else alarm.setNormal();

    // 5. Cập nhật OLED
    display.clearDisplay();
    display.setCursor(0, 0); display.println("--- AI IV DRIP HUB ---");
    display.setCursor(0, 16); display.printf("Target: %.1f bpm\n", targetRate);
    display.setCursor(0, 32); display.printf("Actual: %.1f bpm\n", currentRate);
    display.setCursor(0, 48); display.printf("Vol: %.0f | Valve: %.0f\n", currentVolume, valveAngle);
    display.display();

    // 6. Gửi MQTT (1 giây / lần)
    long now = millis();
    if (now - lastTelemetryTime > 1000) {
        lastTelemetryTime = now;
        StaticJsonDocument<256> doc;
        doc["device"] = device_id;
        doc["current"] = round(currentRate * 10) / 10.0;
        doc["target"] = round(targetRate * 10) / 10.0;
        doc["angle"] = round(valveAngle * 10) / 10.0;
        doc["volume"] = (currentVolume != -1.0) ? round(currentVolume) : 0;
        doc["status"] = aiStatus; // Gửi mã màu AI cho Web React sáng theo

        char buffer[256];
        serializeJson(doc, buffer);
        char telemetry_topic[50];
        sprintf(telemetry_topic, "hospital/telemetry/%s", device_id);
        client.publish(telemetry_topic, buffer);
    }
}