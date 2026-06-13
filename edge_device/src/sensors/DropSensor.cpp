#include "DropSensor.h"

volatile unsigned long lastDropTime = 0;
volatile float calculatedBPM = 0.0;

void IRAM_ATTR onDropDetected() {
    unsigned long currentTime = millis();
    unsigned long timeDifference = currentTime - lastDropTime;

    if (timeDifference > 100) { 
        float newBPM = 60000.0 / timeDifference;

        calculatedBPM = (0.3 * newBPM) + (0.7 * calculatedBPM); 
        
        lastDropTime = currentTime;
    }
}

DropSensor::DropSensor(int pin) {
    irPin = pin;
}

void DropSensor::begin() {
    Serial.println("[SENSOR] Đang khởi động Mắt thần hồng ngoại...");
    pinMode(irPin, INPUT_PULLUP);

    attachInterrupt(digitalPinToInterrupt(irPin), onDropDetected, FALLING);
}

void DropSensor::update() {
    if (millis() - lastDropTime > 5000) {
        calculatedBPM = 0.0;
    }
}

float DropSensor::getBPM() {
    return calculatedBPM;
}