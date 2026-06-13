/**
 * @file AlarmSystem.h
 * @brief LED & Buzzer Alarm Control System
 * 
 * Manages visual (LEDs) and audible (buzzer) alarms based on patient
 * safety status. Implements different alarm patterns for each status level.
 * 
 * Clean Architecture: Interface Segregation Principle
 */

#ifndef ALARMSYSTEM_H
#define ALARMSYSTEM_H

#include <Arduino.h>

// Safety status definitions
typedef enum {
    STATUS_NORMAL = 0,    // Green - All parameters normal
    STATUS_DANGER = 1,    // Red - Critical condition (empty/clogged)
    STATUS_WARNING = 2    // Yellow - Warning condition (fast/slow)
} SafetyStatus;

// Alarm pattern definitions
typedef enum {
    ALARM_OFF = 0,
    ALARM_CONTINUOUS = 1,     // Continuous tone
    ALARM_PULSE = 2,          // Pulsing tone
    ALARM_INTERMITTENT = 3    // Intermittent beeps
} AlarmPattern;

// LED configuration
#define LED_BRIGHTNESS 255
#define LED_FADE_STEP 5

class AlarmSystem {
public:
    /**
     * @brief Construct a new Alarm System object
     * @param red_pin GPIO pin for red LED
     * @param yellow_pin GPIO pin for yellow LED
     * @param green_pin GPIO pin for green LED
     * @param buzzer_pin GPIO pin for active buzzer
     */
    AlarmSystem(uint8_t red_pin, uint8_t yellow_pin, uint8_t green_pin, uint8_t buzzer_pin);
    
    /**
     * @brief Initialize alarm system pins
     */
    void begin();
    
    /**
     * @brief Update alarm state based on safety status
     * @param status Current safety status
     */
    void updateStatus(SafetyStatus status);
    
    /**
     * @brief Get current safety status
     * @return Current status
     */
    SafetyStatus getStatus();
    
    /**
     * @brief Set buzzer pattern
     * @param pattern Alarm pattern to use
     */
    void setBuzzerPattern(AlarmPattern pattern);
    
    /**
     * @brief Set LED state directly
     * @param red State of red LED (0-255 PWM)
     * @param yellow State of yellow LED (0-255 PWM)
     * @param green State of green LED (0-255 PWM)
     */
    void setLEDs(uint8_t red, uint8_t yellow, uint8_t green);
    
    /**
     * @brief Turn off all alarms
     */
    void silence();
    
    /**
     * @brief Test all alarm components
     */
    void selfTest();
    
    /**
     * @brief Process alarm patterns (call in loop)
     */
    void process();
    
    /**
     * @brief Enable or disable buzzer
     * @param enabled true to enable buzzer
     */
    void setBuzzerEnabled(bool enabled);
    
    /**
     * @brief Check if alarm is currently active
     * @return true if any alarm is active
     */
    bool isAlarmActive();

private:
    uint8_t _redPin;
    uint8_t _yellowPin;
    uint8_t _greenPin;
    uint8_t _buzzerPin;
    
    SafetyStatus _currentStatus;
    AlarmPattern _buzzerPattern;
    
    bool _buzzerEnabled;
    bool _alarmActive;
    
    // Pattern timing
    uint32_t _lastPatternUpdate;
    uint8_t _patternPhase;
    uint8_t _ledBrightness;
    bool _brightnessIncreasing;
    
    /**
     * @brief Update LED states based on current status
     */
    void updateLEDs();
    
    /**
     * @brief Update buzzer based on current pattern
     */
    void updateBuzzer();
    
    /**
     * @brief Generate continuous tone pattern
     */
    void patternContinuous();
    
    /**
     * @brief Generate pulsing tone pattern
     */
    void patternPulse();
    
    /**
     * @brief Generate intermittent beep pattern
     */
    void patternIntermittent();
};

#endif // ALARMSYSTEM_H