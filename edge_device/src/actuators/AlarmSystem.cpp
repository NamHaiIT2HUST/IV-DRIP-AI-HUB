#include "AlarmSystem.h"

AlarmSystem::AlarmSystem(int red, int yellow, int green, int buzzer) {
    pinRed = red;
    pinYellow = yellow;
    pinGreen = green;
    pinBuzzer = buzzer;
}

void AlarmSystem::begin() {
    Serial.println("[ACTUATOR] Đang khởi động Hệ thống Báo động...");
    pinMode(pinRed, OUTPUT);
    pinMode(pinYellow, OUTPUT);
    pinMode(pinGreen, OUTPUT);
    pinMode(pinBuzzer, OUTPUT);
    setNormal();
}

void AlarmSystem::setNormal() {
    digitalWrite(pinRed, LOW);
    digitalWrite(pinYellow, LOW);
    digitalWrite(pinGreen, HIGH);
    digitalWrite(pinBuzzer, LOW);
}

void AlarmSystem::setWarning() {
    digitalWrite(pinRed, LOW);
    digitalWrite(pinGreen, LOW);
    digitalWrite(pinBuzzer, LOW);

    if (millis() - lastToggleTime > 300) {
        toggleState = !toggleState;
        digitalWrite(pinYellow, toggleState);
        lastToggleTime = millis();
    }
}

void AlarmSystem::setDanger() {
    digitalWrite(pinYellow, LOW);
    digitalWrite(pinGreen, LOW);

    if (millis() - lastToggleTime > 200) {
        toggleState = !toggleState;
        digitalWrite(pinRed, toggleState);
        digitalWrite(pinBuzzer, toggleState);
        lastToggleTime = millis();
    }
}