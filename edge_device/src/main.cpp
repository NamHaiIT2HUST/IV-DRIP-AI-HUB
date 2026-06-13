#include <Arduino.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

Servo valveServo;
const int SERVO_PIN = 18;     // Chân PWM cho Servo
const int POT_PIN = 4;        // Chân ADC đọc biến trở (Giả lập cảm biến giọt)

// ✏️ SỬA 3 DÒNG NÀY CHO ĐÚNG VỚI MẠNG NHÀ BẠN
const char* ssid = "Tang3";        
const char* password = "23092005";
const char* mqtt_server = "192.168.1.103";     
const char* device_id = "ESP_01";          

WiFiClient espClient;
PubSubClient client(espClient);

float targetRate = 45.0;      
float currentRate = 0.0;     
float valveAngle = 90.0;      
float filteredADC = 0.0;   
long lastTelemetryTime = 0;

void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<128> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.print(F("Lỗi parse JSON lệnh: "));
        Serial.println(error.f_str());
        return;
    }

    if (doc.containsKey("target_rate")) {
        targetRate = doc["target_rate"];
        Serial.printf("🔔 Nhận lệnh phác đồ mới: %.1f bpm\n", targetRate);
    }
}

void setup_wifi() {
    delay(10);
    Serial.println("\n--- KẾT NỐI WIFI ---");
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi OK! IP: " + WiFi.localIP().toString());
}

void reconnect() {
    while (!client.connected()) {
        Serial.print("Đang kết nối MQTT Broker...");
        if (client.connect(device_id)) {
            Serial.println(" Thành công!");
            char command_topic[50];
            sprintf(command_topic, "hospital/command/%s", device_id);
            client.subscribe(command_topic);
        } else {
            Serial.print(" Thất bại, rc=");
            Serial.print(client.state());
            Serial.println(" Thử lại sau 3 giây...");
            delay(3000);
        }
    }
}

void setup() {
    Serial.begin(115200);

    ESP32PWM::allocateTimer(0);
    valveServo.setPeriodHertz(50);
    valveServo.attach(SERVO_PIN, 500, 2400);
    valveServo.write(valveAngle);

    if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println(F("Lỗi: Không tìm thấy OLED"));
        for(;;);
    }
    display.clearDisplay();
    display.setTextColor(WHITE);
    display.display();

    setup_wifi();
    client.setServer(mqtt_server, 1883);
    client.setCallback(mqtt_callback);
}

void loop() {
    if (!client.connected()) reconnect();
    client.loop();

    int rawADC = analogRead(POT_PIN);
    float alpha = 0.1; 
    filteredADC = (alpha * rawADC) + ((1.0 - alpha) * filteredADC);

    currentRate = map(filteredADC, 0, 4095, 0, 100);

    float error = targetRate - currentRate;
    float k_factor = 0.15;

    valveAngle = valveAngle + (error * k_factor);
    if (valveAngle > 180.0) valveAngle = 180.0;
    if (valveAngle < 0.0) valveAngle = 0.0;

    valveServo.write(valveAngle);

    display.clearDisplay();
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("--- AI IV DRIP HUB ---");
    display.setCursor(0, 20);
    display.printf("Target : %.1f bpm\n", targetRate);
    display.printf("Actual : %.1f bpm\n", currentRate);
    display.printf("Valve  : %.1f deg\n", valveAngle);
    display.display();

    long now = millis();
    if (now - lastTelemetryTime > 1000) {
        lastTelemetryTime = now;
        
        StaticJsonDocument<256> doc;
        doc["device"] = device_id;
        doc["current"] = round(currentRate * 10) / 10.0;
        doc["target"] = round(targetRate * 10) / 10.0;
        doc["angle"] = round(valveAngle * 10) / 10.0;

        char buffer[256];
        serializeJson(doc, buffer);
        
        char telemetry_topic[50];
        sprintf(telemetry_topic, "hospital/telemetry/%s", device_id);
        client.publish(telemetry_topic, buffer);
        
        Serial.printf(">>> Uplink: %s\n", buffer);
    }

    delay(20); 
}