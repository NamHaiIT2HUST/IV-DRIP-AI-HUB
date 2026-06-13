#ifndef LOAD_CELL_SENSOR_H
#define LOAD_CELL_SENSOR_H

#include <Arduino.h>
#include "HX711.h"

class LoadCellSensor {
private:
    HX711 scale;
    int doutPin;
    int sckPin;
    float calibrationFactor;

public:
    LoadCellSensor(int dout, int sck, float calFactor);

    void begin();

    float getVolume();
};

#endif