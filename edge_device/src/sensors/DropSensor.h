#ifndef DROP_SENSOR_H
#define DROP_SENSOR_H

#include <Arduino.h>

class DropSensor {
public:
    DropSensor(int pin);
    void begin();
    void update(); 
    float getBPM();

private:
    int irPin;
};

#endif