/**
 * @file LoadCellSensor.h
 * @brief HX711 Load Cell Sensor Interface with Signal Smoothing
 * 
 * This class provides an interface to the HX711 24-bit ADC for measuring
 * IV bag weight/volume. Implements moving average filter for noise reduction.
 * 
 * Clean Architecture: Interface Segregation Principle
 */

#ifndef LOADCELLSENSOR_H
#define LOADCELLSENSOR_H

#include <Arduino.h>
#include <HX711.h>

// Smoothing filter configuration
#define LOADCELL_FILTER_SIZE 10     // Moving average window size
#define LOADCELL_READ_DELAY 100     // Delay between readings (ms)
#define LOADCELL_SETTLE_TIME 500    // Time for readings to stabilize (ms)

// Calibration constants (must be calibrated per setup)
#define LOADCELL_CALIBRATION_FACTOR -7050.0f  // Negative for common load cell orientation
#define LOADCELL_OFFSET 0                     // Tare offset

// Volume conversion (grams to mL, assuming water-like density)
#define GRAMS_TO_ML 1.0f

class LoadCellSensor {
public:
    /**
     * @brief Construct a new Load Cell Sensor object
     * @param dt_pin Data pin connected to HX711 DT
     * @param sck_pin Clock pin connected to HX711 SCK
     */
    LoadCellSensor(uint8_t dt_pin, uint8_t sck_pin);
    
    /**
     * @brief Initialize the load cell sensor
     * @param calibration_factor Optional calibration factor override
     * @return true if initialization successful
     */
    bool begin(float calibration_factor = LOADCELL_CALIBRATION_FACTOR);
    
    /**
     * @brief Tare the scale (set current weight as zero)
     */
    void tare();
    
    /**
     * @brief Get the current weight in grams (filtered)
     * @return Weight in grams (float)
     */
    float getWeightGrams();
    
    /**
     * @brief Get the current volume in milliliters
     * @return Volume in mL (float)
     */
    float getVolumeML();
    
    /**
     * @brief Get raw unfiltered reading
     * @return Raw weight in grams
     */
    float getRawWeightGrams();
    
    /**
     * @brief Check if the bag is empty (below threshold)
     * @param threshold_ml Empty threshold in mL (default 10mL)
     * @return true if volume is below threshold
     */
    bool isEmpty(float threshold_ml = 10.0f);
    
    /**
     * @brief Check if sensor readings are valid
     * @return true if sensor is functioning properly
     */
    bool isValid();
    
    /**
     * @brief Set the calibration factor
     * @param factor Calibration factor
     */
    void setCalibrationFactor(float factor);
    
    /**
     * @brief Get the current calibration factor
     * @return Calibration factor
     */
    float getCalibrationFactor();

private:
    HX711 _hx711;
    uint8_t _dtPin;
    uint8_t _sckPin;
    float _calibrationFactor;
    float _filterBuffer[LOADCELL_FILTER_SIZE];
    uint8_t _filterIndex;
    bool _initialized;
    bool _isValid;
    
    /**
     * @brief Read raw value from HX711 with settling time
     * @return Raw reading or NaN if invalid
     */
    float readRaw();
    
    /**
     * @brief Apply moving average filter
     * @param newValue New value to add to filter
     * @return Filtered average
     */
    float applyFilter(float newValue);
    
    /**
     * @brief Calculate moving average of buffer
     * @return Average value
     */
    float calculateAverage();
};

#endif // LOADCELLSENSOR_H