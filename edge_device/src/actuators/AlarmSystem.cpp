/**
 * @file AlarmSystem.cpp
 * @brief LED & Buzzer Alarm Implementation
 */

#include "AlarmSystem.h"

// PWM configuration
#define PWM_FREQUENCY 5000
#define PWM_RESOLUTION 8
#define PWM_CHANNEL_RED 0
#define PWM_CHANNEL_YELLOW 1
#define PWM_CHANNEL_GREEN 2

// Pattern timing (ms)
#define PATTERN_PULSE_PERIOD 1000
#define PATTERN_INTERMITTENT_ON 200
#define PATTERN_INTERMITTENT_OFF 800

AlarmSystem::AlarmSystem(uint8_t red_pin, uint8_t yellow_pin, uint8_t green_pin, uint8_t buzzer_pin)
    : _redPin(red_pin), _yellowPin(yellow_pin), _greenPin(green_pin), _buzzerPin(buzzer_pin),
      _currentStatus(STATUS_NORMAL), _buzzerPattern(ALARM_OFF), _buzzerEnabled(true),
      _alarmActive(false), _lastPatternUpdate(0), _patternPhase(0), _ledBrightness(0),
      _brightnessIncreasing(true) {
}

void AlarmSystem::begin() {
    // Configure LED pins with PWM
    ledcSetup(PWM_CHANNEL_RED, PWM_FREQUENCY, PWM_RESOLUTION);
    ledcSetup(PWM_CHANNEL_YELLOW, PWM_FREQUENCY, PWM_RESOLUTION);
    ledcSetup(PWM_CHANNEL_GREEN, PWM_FREQUENCY, PWM_RESOLUTION);
    
    ledcAttachPin(_redPin, PWM_CHANNEL_RED);
    ledcAttachPin(_yellowPin, PWM_CHANNEL_YELLOW);
    ledcAttachPin(_greenPin, PWM_CHANNEL_GREEN);
    
    // Configure buzzer pin
    pinMode(_buzzerPin, OUTPUT);
    digitalWrite(_buzzerPin, LOW);
    
    // Initialize to normal status
    updateStatus(STATUS_NORMAL);
    
    Serial.println("[AlarmSystem] Initialized");
}

void AlarmSystem::updateStatus(SafetyStatus status) {
    _currentStatus = status;
    
    switch (status) {
        case STATUS_NORMAL:
            _buzzerPattern = ALARM_OFF;
            _alarmActive = false;
            break;
            
        case STATUS_DANGER:
            _buzzerPattern = ALARM_CONTINUOUS;
            _alarmActive = true;
            break;
            
        case STATUS_WARNING:
            _buzzerPattern = ALARM_PULSE;
            _alarmActive = true;
            break;
            
        default:
            _buzzerPattern = ALARM_OFF;
            _alarmActive = false;
            break;
    }
    
    updateLEDs();
}

SafetyStatus AlarmSystem::getStatus() {
    return _currentStatus;
}

void AlarmSystem::setBuzzerPattern(AlarmPattern pattern) {
    _buzzerPattern = pattern;
}

void AlarmSystem::setLEDs(uint8_t red, uint8_t yellow, uint8_t green) {
    ledcWrite(PWM_CHANNEL_RED, red);
    ledcWrite(PWM_CHANNEL_YELLOW, yellow);
    ledcWrite(PWM_CHANNEL_GREEN, green);
}

void AlarmSystem::updateLEDs() {
    switch (_currentStatus) {
        case STATUS_NORMAL:
            setLEDs(0, 0, LED_BRIGHTNESS);  // Green on
            break;
            
        case STATUS_DANGER:
            setLEDs(LED_BRIGHTNESS, 0, 0);  // Red on
            break;
            
        case STATUS_WARNING:
            // Pulsing yellow
            if (_brightnessIncreasing) {
                _ledBrightness += LED_FADE_STEP;
                if (_ledBrightness >= LED_BRIGHTNESS) {
                    _brightnessIncreasing = false;
                }
            } else {
                _ledBrightness -= LED_FADE_STEP;
                if (_ledBrightness <= 0) {
                    _brightnessIncreasing = true;
                }
            }
            setLEDs(0, _ledBrightness, 0);
            break;
            
        default:
            setLEDs(0, 0, 0);
            break;
    }
}

void AlarmSystem::updateBuzzer() {
    if (!_buzzerEnabled || _buzzerPattern == ALARM_OFF) {
        digitalWrite(_buzzerPin, LOW);
        return;
    }
    
    uint32_t currentTime = millis();
    
    switch (_buzzerPattern) {
        case ALARM_CONTINUOUS:
            patternContinuous();
            break;
            
        case ALARM_PULSE:
            patternPulse();
            break;
            
        case ALARM_INTERMITTENT:
            patternIntermittent();
            break;
            
        default:
            digitalWrite(_buzzerPin, LOW);
            break;
    }
}

void AlarmSystem::patternContinuous() {
    digitalWrite(_buzzerPin, HIGH);
}

void AlarmSystem::patternPulse() {
    uint32_t elapsed = millis() - _lastPatternUpdate;
    
    if (elapsed >= PATTERN_PULSE_PERIOD) {
        _lastPatternUpdate = millis();
        _patternPhase = (_patternPhase + 1) % 2;
    }
    
    digitalWrite(_buzzerPin, _patternPhase ? HIGH : LOW);
}

void AlarmSystem::patternIntermittent() {
    uint32_t elapsed = millis() - _lastPatternUpdate;
    
    if (_patternPhase == 0) {
        // ON phase
        digitalWrite(_buzzerPin, HIGH);
        if (elapsed >= PATTERN_INTERMITTENT_ON) {
            _lastPatternUpdate = millis();
            _patternPhase = 1;
            digitalWrite(_buzzerPin, LOW);
        }
    } else {
        // OFF phase
        digitalWrite(_buzzerPin, LOW);
        if (elapsed >= PATTERN_INTERMITTENT_OFF) {
            _lastPatternUpdate = millis();
            _patternPhase = 0;
        }
    }
}

void AlarmSystem::silence() {
    _buzzerPattern = ALARM_OFF;
    digitalWrite(_buzzerPin, LOW);
    setLEDs(0, 0, 0);
    _alarmActive = false;
}

void AlarmSystem::selfTest() {
    Serial.println("[AlarmSystem] Running self-test...");
    
    // Test LEDs
    setLEDs(LED_BRIGHTNESS, 0, 0);
    delay(500);
    setLEDs(0, LED_BRIGHTNESS, 0);
    delay(500);
    setLEDs(0, 0, LED_BRIGHTNESS);
    delay(500);
    setLEDs(0, 0, 0);
    
    // Test buzzer
    digitalWrite(_buzzerPin, HIGH);
    delay(500);
    digitalWrite(_buzzerPin, LOW);
    
    Serial.println("[AlarmSystem] Self-test complete");
}

void AlarmSystem::process() {
    updateLEDs();
    updateBuzzer();
}

void AlarmSystem::setBuzzerEnabled(bool enabled) {
    _buzzerEnabled = enabled;
    if (!enabled) {
        digitalWrite(_buzzerPin, LOW);
    }
}

bool AlarmSystem::isAlarmActive() {
    return _alarmActive;
}