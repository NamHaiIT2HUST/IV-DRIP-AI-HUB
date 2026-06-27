/**
 * @file DropSensor.cpp
 * @brief IR Drop Sensor Implementation with Hardware Interrupt
 */

#include "DropSensor.h"
#include "esp_timer.h"

portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

// Static array to hold sensor instances for ISR (max 8 sensors)
static DropSensor* s_dropSensors[8] = {nullptr};

DropSensor::DropSensor(uint8_t interrupt_pin)
    : _interruptPin(interrupt_pin), _dropCount(0), _lastDropTime(0),
      _lastValidDropTime(0), _dropDetected(false), _timestampIndex(0),
      _statusFlags(0), _targetBPM(60.0f), _currentBPM(0.0f),
      _initialized(false) {
    // Initialize timestamp ring buffer
    memset(_dropTimestamps, 0, sizeof(_dropTimestamps));
}

bool DropSensor::begin() {
    // Configure interrupt pin
    pinMode(_interruptPin, INPUT_PULLUP);
    
    // Find available slot in static array
    int8_t slot = -1;
    for (int8_t i = 0; i < 8; i++) {
        if (s_dropSensors[i] == nullptr) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        Serial.println("[DropSensor] ERROR: Maximum sensors reached!");
        return false;
    }
    
    // Store instance pointer for ISR
    s_dropSensors[slot] = this;
    
    // Tạm thời comment ngắt
    // attachInterruptArg(_interruptPin, isrHandler, (void*)this, FALLING);
    
    // Đọc trạng thái chân để debug
    int pinState = digitalRead(_interruptPin);
    Serial.printf("[DropSensor] Debug - Trạng thái chân IR (%d): %d\n", _interruptPin, pinState);
    
    _initialized = true;
    return true;
}

void IRAM_ATTR DropSensor::isrHandler(void* arg) {
    DropSensor* sensor = static_cast<DropSensor*>(arg);
    if (sensor != nullptr) {
        sensor->handleDrop();
    }
}

void IRAM_ATTR DropSensor::handleDrop() {
    uint32_t currentTime = esp_timer_get_time() / 1000;  // ms
    
    // Debounce check
    if (currentTime - _lastDropTime < DROP_DEBOUNCE_MS) {
        return;
    }
    
    // Minimum interval check (prevent false triggers)
    if (currentTime - _lastValidDropTime < DROP_MIN_INTERVAL_MS) {
        return;
    }
    
    // Valid drop detected
    _lastDropTime = currentTime;
    _lastValidDropTime = currentTime;
    _dropCount++;
    _dropDetected = true;
    
    // Store timestamp in ring buffer
    _dropTimestamps[_timestampIndex] = currentTime;
    _timestampIndex = (_timestampIndex + 1) % 60;
}

float DropSensor::getBPM() {
    if (!_initialized) return 0.0f;
    
    // Disable interrupts briefly for consistent reading
    portENTER_CRITICAL(&mux);
    float bpm = calculateBPM();
    portEXIT_CRITICAL(&mux);
    
    _currentBPM = bpm;
    return bpm;
}

float DropSensor::calculateBPM() {
    uint32_t currentTime = esp_timer_get_time() / 1000;
    
    // Count drops in the last minute
    uint32_t dropsInWindow = 0;
    
    for (uint8_t i = 0; i < 60; i++) {
        if (_dropTimestamps[i] > 0 && 
            (currentTime - _dropTimestamps[i]) <= DROP_WINDOW_MS) {
            dropsInWindow++;
        }
    }
    
    if (dropsInWindow == 0) {
        return 0.0f;
    }
    
    // Calculate BPM based on time span of recent drops
    if (dropsInWindow >= 2) {
        // Find oldest drop in window
        uint32_t oldestTime = currentTime;
        for (uint8_t i = 0; i < 60; i++) {
            if (_dropTimestamps[i] > 0 && 
                (currentTime - _dropTimestamps[i]) <= DROP_WINDOW_MS &&
                _dropTimestamps[i] < oldestTime) {
                oldestTime = _dropTimestamps[i];
            }
        }
        
        uint32_t timeSpan = currentTime - oldestTime;
        if (timeSpan > 0) {
            return (float)(dropsInWindow - 1) * 60000.0f / timeSpan;
        }
    }
    
    // Fallback: extrapolate from single drop
    uint32_t timeSinceLast = currentTime - _lastValidDropTime;
    if (timeSinceLast < DROP_TIMEOUT_MS) {
        return 60000.0f / DROP_WINDOW_MS * dropsInWindow;
    }
    
    return 0.0f;
}

bool DropSensor::isValidDrop() {
    uint32_t currentTime = esp_timer_get_time() / 1000;
    return (currentTime - _lastDropTime) >= DROP_DEBOUNCE_MS;
}

uint32_t DropSensor::getDropCount() {
    portENTER_CRITICAL(&mux);
    uint32_t count = _dropCount;
    portEXIT_CRITICAL(&mux);
    return count;
}

bool DropSensor::isFlowing() {
    return getBPM() > 0.5f;  // Consider flowing if > 0.5 BPM
}

bool DropSensor::hasStopped() {
    uint32_t timeSinceLast = getTimeSinceLastDrop();
    return timeSinceLast > DROP_TIMEOUT_MS;
}

uint32_t DropSensor::getTimeSinceLastDrop() {
    if (_lastValidDropTime == 0) return UINT32_MAX;
    
    uint32_t currentTime = esp_timer_get_time() / 1000;
    return currentTime - _lastValidDropTime;
}

void DropSensor::reset() {
    portENTER_CRITICAL(&mux);
    _dropCount = 0;
    _lastDropTime = 0;
    _lastValidDropTime = 0;
    _dropDetected = false;
    memset(_dropTimestamps, 0, sizeof(_dropTimestamps));
    _timestampIndex = 0;
    portEXIT_CRITICAL(&mux);
}

uint8_t DropSensor::getStatus() {
    return _statusFlags;
}

void DropSensor::setTargetBPM(float target_bpm) {
    _targetBPM = target_bpm;
}

float DropSensor::getTargetBPM() {
    return _targetBPM;
}

bool DropSensor::isWithinTargetRange(float tolerance_percent) {
    float current = getBPM();
    float tolerance = _targetBPM * (tolerance_percent / 100.0f);
    
    return (current >= (_targetBPM - tolerance)) && 
           (current <= (_targetBPM + tolerance));
}