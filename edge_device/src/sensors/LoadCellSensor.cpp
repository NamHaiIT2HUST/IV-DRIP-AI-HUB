#include "LoadCellSensor.h"

LoadCellSensor::LoadCellSensor(int dout, int sck, float calFactor) {
    doutPin = dout;
    sckPin = sck;
    calibrationFactor = calFactor;
}

void LoadCellSensor::begin() {
    Serial.println("[SENSOR] Đang khởi động Loadcell HX711...");
    scale.begin(doutPin, sckPin);
    scale.set_scale(calibrationFactor);
    scale.tare(); // Reset cân về 0
    Serial.println("[SENSOR] Loadcell sẵn sàng!");
}

float LoadCellSensor::getVolume() {
    if (scale.is_ready()) {
        float vol = scale.get_units(3); // Lấy trung bình 3 lần 
        return (vol > 0) ? vol : 0.0;  
    }
    return -1.0; 
}