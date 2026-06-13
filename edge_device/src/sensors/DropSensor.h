/**
 * @file DropSensor.h
 * @brief IR Drop Sensor with Hardware Interrupt for BPM Calculation
 * 
 * Uses hardware interrupt on GPIO to detect IV drops via IR sensor.
 * Implements debounce logic and calculates drops per minute (BPM).
 * 
 * Clean Architecture: Single Responsibility Principle
 */

#ifndef DROPSENSOR_H
#define DROPSENSOR_H

#include <Arduino.h>

// Drop sensor configuration
#define DROP_DEBOUNCE_MS 50         // Debounce time between drops
#define DROP_WINDOW_MS 60000        // Time window for BPM calculation (1 minute)
#define DROP_MIN_INTERVAL_MS 100    // Minimum interval between valid drops
#define DROP_TIMEOUT_MS 5000        // Timeout to consider flow stopped

// Status flags
#define DROP_FLAG_VALID (1 << 0)    // Valid drop detected
#define DROP_FLAG_ERROR (1 << 1)    // Sensor error

class DropSensor {
public:
    /**
     * @brief Construct a new Drop Sensor object
     * @param interrupt_pin GPIO pin connected to IR sensor output
     */
    DropSensor(uint8_t interrupt_pin);
    
    /**
     * @brief Initialize the drop sensor with hardware interrupt
     * @return true if initialization successful
     */
    bool begin();
    
    /**
     * @brief Get current drops per minute (BPM)
     * @return BPM value (float for precision)
     */
    float getBPM();
    
    /**
     * @brief Get raw drop count in current window
     * @return Number of drops detected
     */
    uint32_t getDropCount();
    
    /**
     * @brief Check if drops are being detected
     * @return true if flow is active
     */
    bool isFlowing();
    
    /**
     * @brief Check if flow has stopped (timeout)
     * @return true if no drops detected within timeout
     */
    bool hasStopped();
    
    /**
     * @brief Get time since last drop (ms)
     * @return Milliseconds since last drop
     */
    uint32_t getTimeSinceLastDrop();
    
    /**
     * @brief Reset drop counter and BPM calculation
     */
    void reset();
    
    /**
     * @brief Get sensor status flags
     * @return Status flags byte
     */
    uint8_t getStatus();
    
    /**
     * @brief Set target BPM for comparison
     * @param target_bpm Target drops per minute
     */
    void setTargetBPM(float target_bpm);
    
    /**
     * @brief Get target BPM
     * @return Target BPM value
     */
    float getTargetBPM();
    
    /**
     * @brief Check if current BPM is within acceptable range of target
     * @param tolerance_percent Acceptable deviation percentage (default ±20%)
     * @return true if BPM is within range
     */
    bool isWithinTargetRange(float tolerance_percent = 20.0f);

private:
    uint8_t _interruptPin;
    volatile uint32_t _dropCount;
    volatile uint32_t _lastDropTime;
    volatile uint32_t _lastValidDropTime;
    volatile bool _dropDetected;
    
    uint32_t _dropTimestamps[60];  // Ring buffer for last 60 drops
    uint8_t _timestampIndex;
    uint8_t _statusFlags;
    
    float _targetBPM;
    float _currentBPM;
    bool _initialized;
    
    // Interrupt Service Routine handler
    static void IRAM_ATTR isrHandler(void* arg);
    
    /**
     * @brief Process a drop detection event
     */
    void handleDrop();
    
    /**
     * @brief Calculate BPM from recent drop timestamps
     * @return Calculated BPM
     */
    float calculateBPM();
    
    /**
     * @brief Debounce check for drop detection
     * @return true if drop is valid (not noise)
     */
    bool isValidDrop();
};

#endif // DROPSENSOR_H