#include <Arduino.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

Servo valveServo;
const int SERVO_PIN = 18;     //Chân xuất xung PWM cho Servo
const int POT_PIN = 34;       //Chân ADC đọc Biến trở (Giả lập cảm biến giọt)

float targetRate = 45.0;      //Phác đồ yêu cầu: 45 giọt/phút
float currentRate = 0.0;      //tốc độ thực tế đo được
float valveAngle = 90.0;      //Góc mở van hiện tại (0 - 180 độ)

void setup() {
  Serial.begin(115200);
  Serial.println("Khoi dong AI IV Drip Hub...");

  //Khởi tạo Servo
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  valveServo.setPeriodHertz(50); //Servo chuẩn chạy ở 50Hz
  valveServo.attach(SERVO_PIN, 500, 2400); 
  valveServo.write(valveAngle);

  //Khởi tạo OLED
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("Loi: Khong tim thay man hinh OLED"));
    for(;;); // Treo máy nếu không có màn hình
  }
  display.clearDisplay();
  display.setTextColor(WHITE);
  display.setTextSize(1);
  display.setCursor(0, 10);
  display.println("System Booting...");
  display.display();
  delay(1000);
}

void loop() {
  //đọc ADC từ biến trở
  int rawADC = analogRead(POT_PIN);
  float alpha = 0.1; // Trọng số (0.0 đến 1.0). Càng nhỏ càng mượt nhưng phản ứng chậm.
  filteredADC = (alpha * rawADC) + ((1.0 - alpha) * filteredADC);
  
  currentRate = map(rawADC, 0, 4095, 0, 100);

  //Tính sai số Delta
  float error = targetRate - currentRate;

  //Thuật toán điều khiển bù trừ (Bản lề của phương pháp Newton/PID)
  //Hệ số K_factor quyết định tốc độ "vọt lố" của van
  float k_factor = 0.15; 
  valveAngle = valveAngle + (error * k_factor);

  //Servo chỉ quay từ 0 đến 180 độ
  if (valveAngle > 180.0) valveAngle = 180.0;
  if (valveAngle < 0.0) valveAngle = 0.0;

  valveServo.write(valveAngle);

  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("--- IV DRIP HUB ---");
  
  display.setCursor(0, 20);
  display.printf("Target : %.1f bpm\n", targetRate);
  display.printf("Current: %.1f bpm\n", currentRate);
  display.printf("Valve  : %.1f deg\n", valveAngle);
  
  display.display();

  Serial.printf("{\"target\":%.1f, \"current\":%.1f, \"angle\":%.1f}\n", 
                targetRate, currentRate, valveAngle);

  delay(200); //Tốc độ lấy mẫu 5Hz
}