/**
 * @file LoadCellSensor.cpp
 * @brief HX711 Load Cell Sensor Implementation
 */

#include "LoadCellSensor.h"
#include <numeric>

LoadCellSensor::LoadCellSensor(uint8_t dt_pin, uint8_t sck_pin)
    : _dtPin(dt_pin), _sckPin(sck_pin), _calibrationFactor(LOADCELL_CALIBRATION_FACTOR),
      _filterIndex(0), _initialized(false), _isValid(false) {
    // Initialize filter buffer to zero
    std::fill(_filterBuffer, _filterBuffer + LOADCELL_FILTER_SIZE, 0.0f);
}

bool LoadCellSensor::begin(float calibration_factor) {
    _calibrationFactor = calibration_factor;
    
    // Initialize HX711
    _hx711.begin(_dtPin, _sckPin);
    
    // Wait for sensor to stabilize
    delay(LOADCELL_SETTLE_TIME);
    
    // Check if sensor is ready
    if (!_hx711.is_ready()) {
        Serial.println("[LoadCell] ERROR: HX711 not found!");
        _isValid = false;
        return false;
    }
    
    // Set gain (default 128 for ±20mV range)
    _hx711.set_gain(128);
    
    // Tare the scale
    tare();
    
    _initialized = true;
    _isValid = true;
    Serial.println("[LoadCell] HX711 initialized successfully");
    
    return true;
}

void LoadCellSensor::tare() {
    if (!_initialized) return;
    
    Serial.println("[LoadCell] Taring scale...");
    _hx711.tare(10);  // Average 10 readings for tare
    delay(LOADCELL_SETTLE_TIME);
    
    // Reset filter buffer
    std::fill(_filterBuffer, _filterBuffer + LOADCELL_FILTER_SIZE, 0.0f);
    _filterIndex = 0;
}

float LoadCellSensor::readRaw() {
    if (!_initialized || !_isValid) {
        return NAN;
    }
    
    if (!_hx711.is_ready()) {
        return NAN;
    }
    
    // Read and convert to grams
    float reading = _hx711.get_units(3);  // Average 3 readings
    
    // Check for invalid readings
    if (isnan(reading) || isinf(reading)) {
        return NAN;
    }
    
    // Check for out-of-range values (indicates error)
    if (abs(reading) > 5000.0f) {  // More than 5kg is likely an error
        return NAN;
    }
    
    return reading;
}

float LoadCellSensor::applyFilter(float newValue) {
    // Add new value to buffer
    _filterBuffer[_filterIndex] = newValue;
    _filterIndex = (_filterIndex + 1) % LOADCELL_FILTER_SIZE;
    
    return calculateAverage();
}

float LoadCellSensor::calculateAverage() {
    float sum = 0.0f;
    uint8_t validCount = 0;
    
    for (uint8_t i = 0; i < LOADCELL_FILTER_SIZE; i++) {
        if (!isnan(_filterBuffer[i]) && !isinf(_filterBuffer[i])) {
            sum += _filterBuffer[i];
            validCount++;
        }
    }
    
    if (validCount == 0) return 0.0f;
    return sum / validCount;
}

float LoadCellSensor::getWeightGrams() {
    float raw = readRaw();
    
    if (isnan(raw)) {
        // Return last known good value or zero
        return calculateAverage();
    }
    
    return applyFilter(raw);
}

float LoadCellSensor::getVolumeML() {
    float weight = getWeightGrams();
    if (isnan(weight)) return 0.0f;
    return weight * GRAMS_TO_ML;
}

float LoadCellSensor::getRawWeightGrams() {
    return readRaw();
}

bool LoadCellSensor::isEmpty(float threshold_ml) {
    float volume = getVolumeML();
    return volume < threshold_ml;
}

bool LoadCellSensor::isValid() {
    return _isValid && _hx711.is_ready();
}

void LoadCellSensor::setCalibrationFactor(float factor) {
    _calibrationFactor = factor;
    _hx711.set_scale(factor);
}

float LoadCellSensor::getCalibrationFactor() {
    return _calibrationFactor;
}