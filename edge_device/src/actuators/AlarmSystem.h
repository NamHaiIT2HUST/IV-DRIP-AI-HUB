#ifndef ALARM_SYSTEM_H
#define ALARM_SYSTEM_H

#include <Arduino.h>

class AlarmSystem {
public:
    AlarmSystem(int red, int yellow, int green, int buzzer);
    void begin();
    void setNormal();  
    void setWarning();
    void setDanger();  

private:
    int pinRed, pinYellow, pinGreen, pinBuzzer;
    unsigned long lastToggleTime = 0;
    bool toggleState = false;
};

#endif