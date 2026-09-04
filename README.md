# AI-Driven Numerical IV Drip Hub

A smart medical IV drip monitoring system that combines edge AI, IoT connectivity, and real-time visualization for patient safety monitoring.

![IV Drip Hub](https://img.shields.io/badge/Version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![Platform](https://img.shields.io/badge/Platform-ESP32--S3-orange.svg)

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Hardware Components](#hardware-components)
- [Wiring Diagram](#wiring-diagram)
- [Software Setup](#software-setup)
  - [Prerequisites](#prerequisites)
  - [Firmware Setup](#firmware-setup)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Infrastructure Setup](#infrastructure-setup)
- [Running the System](#running-the-system)
- [Demo Mode](#demo-mode)
- [API Documentation](#api-documentation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Project Overview

The IV Drip Hub is a comprehensive medical monitoring system designed to:

1. **Monitor IV drip rates** in real-time using IR sensors
2. **Track remaining IV volume** using load cell sensors
3. **Automatically adjust drip rate** using a servo-controlled valve with PID control
4. **Provide local and remote alerts** for abnormal conditions
5. **Stream telemetry data** to a central backend for monitoring and analysis
6. **Display real-time data** on both local OLED and web dashboard

### Safety Status Levels

| Status | Color | Condition | Action |
|--------|-------|-----------|--------|
| **Normal** | 🟢 Green | All parameters within range | Continue monitoring |
| **Warning** | 🟡 Yellow | BPM outside ±30% of target | Alert nurse, auto-adjust |
| **Danger** | 🔴 Red | Empty bag, clogged line, or critical BPM | Sound alarm, notify immediately |

## ✨ Features

### Edge Device (ESP32-S3)
- Real-time drop counting via hardware interrupt (accurate BPM calculation)
- Load cell measurement with moving average filtering
- PID-controlled servo for automatic drip rate adjustment
- OLED display for local monitoring
- LED indicators and buzzer for local alarms
- WiFi connectivity with MQTT telemetry
- Edge AI safety logic (no cloud dependency for critical alerts)

### Backend
- MQTT worker for real-time data ingestion
- InfluxDB time-series database for historical data
- FastAPI REST API for data queries
- Health monitoring and alert tracking

### Frontend Dashboard
- Real-time MQTT updates (sub-second latency)
- Historical data visualization with Recharts
- Status color coding and alert notifications
- Responsive design for desktop and mobile

## 🏗️ System Architecture

```
┌─────────────────┐     MQTT      ┌─────────────────┐
│   ESP32-S3      │──────────────▶│  MQTT Broker    │
│   Edge Device   │               │  (Mosquitto)    │
└─────────────────┘               └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │  MQTT Worker    │
                                  │  (Python)       │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │   InfluxDB      │
                                  │  (Time Series)  │
                                  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐     ┌─────────────────┐
                                  │   FastAPI       │◀────│  React Frontend │
                                  │   Backend       │     │  (Dashboard)    │
                                  └─────────────────┘     └─────────────────┘
```

## 🔧 Hardware Components

| Component | Model | Quantity | Purpose |
|-----------|-------|----------|---------|
| ESP32-S3 DevKit | ESP32-S3-WROOM-1 | 1 | Main controller |
| Load Cell | 5kg HX711 Module | 1 | IV volume measurement |
| IR Sensor | LM393 Drop Counter | 1 | Drop detection |
| Servo Motor | SG90 Micro Servo | 1 | Valve control |
| OLED Display | SSD1306 0.96" I2C | 1 | Local display |
| Active Buzzer | 5V Active Buzzer | 1 | Audible alarm |
| LEDs | 5mm Red/Yellow/Green | 3 | Status indicators |
| Potentiometer | 10kΩ (Optional) | 1 | Manual override |

## 🔌 Wiring Diagram

### ESP32-S3 Pin Connections

> Pin numbers below match `edge_device/src/main.cpp` (`#define ..._PIN`) and `DEMO_GUIDE_AND_STATE.md`,
> the team's own record of the hardware bring-up on the ESP32-S3 (which pins avoided boot/PSRAM conflicts).

| Component | ESP32-S3 Pin | Notes |
|-----------|--------------|-------|
| **HX711 (Load Cell)** | | |
| DT | GPIO 18 | Data pin |
| SCK | GPIO 19 | Clock pin |
| VCC | 5V | Power |
| GND | GND | Ground |
| **IR Drop Sensor** | | |
| OUT | GPIO 5 | Interrupt pin (FALLING edge) |
| VCC | 5V | Power |
| GND | GND | Ground |
| **Servo Motor** | | |
| Signal | GPIO 21 | PWM output |
| VCC | 5V | Power (external recommended) |
| GND | GND | Ground |
| **OLED Display (SH1106, SW I2C)** | | |
| SDA | GPIO 4 | I2C data |
| SCL | GPIO 7 | I2C clock |
| VCC | 3.3V | Power |
| GND | GND | Ground |
| **LEDs** | | |
| Red LED | GPIO 10 | Via 220Ω resistor |
| Yellow LED | GPIO 11 | Via 220Ω resistor |
| Green LED | GPIO 12 | Via 220Ω resistor |
| **Buzzer** | | |
| Positive | GPIO 6 | Active buzzer |
| Negative | GND | Ground |

### Wiring Schematic

```
                    ┌─────────────────────────────────────┐
                    │           ESP32-S3 DevKit           │
                    │                                     │
   ┌────────────────┤ GPIO 18 (DT)  ◄─── HX711 DT        │
   │                │ GPIO 19 (SCK) ◄─── HX711 SCK       │
   │                │ GPIO 5  (IRQ) ◄─── IR Sensor OUT   │
   │                │ GPIO 21 (PWM) ───► Servo Signal    │
   │                │ GPIO 4  (SDA) ◄──► OLED SDA        │
   │                │ GPIO 7  (SCL) ◄──► OLED SCL        │
   │                │ GPIO 10 ───────► Red LED           │
   │                │ GPIO 11 ───────► Yellow LED        │
   │                │ GPIO 12 ───────► Green LED         │
   │                │ GPIO 6  ───────► Buzzer            │
   │                │                                     │
   │                │ 5V ─────────────► HX711 VCC        │
   │                │ 5V ─────────────► IR Sensor VCC    │
   │                │ 5V ─────────────► Servo VCC        │
   │                │ 3.3V ───────────► OLED VCC         │
   │                │ GND ────────────► All GND          │
   │                └─────────────────────────────────────┘
   │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  │ HX711    │  │ IR Sensor│  │  Servo   │
   │  │ + Load   │  │  LM393   │  │   SG90   │
   │  │  Cell    │  │          │  │          │
   │  └──────────┘  └──────────┘  └──────────┘
   │
   │  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │  │  OLED    │  │  LEDs    │  │  Buzzer  │
   │  │ SH1106   │  │RGB Status│  │  Active  │
   │  └──────────┘  └──────────┘  └──────────┘
   └─────────────────────────────────────────────
```

## 💻 Software Setup

### Prerequisites

- **PlatformIO** (for firmware development)
- **Python 3.9+** (for backend)
- **Node.js 18+** (for frontend)
- **Docker & Docker Compose** (for infrastructure)

### Firmware Setup

1. **Install PlatformIO** (if not already installed):
   ```bash
   # For VS Code users
   # Install "PlatformIO IDE" extension from VS Code marketplace
   
   # Or install via pip
   pip install platformio
   ```

2. **Configure WiFi and MQTT settings**:
   ```bash
   # Edit edge_device/src/main.cpp
   # Update these lines with your network credentials:
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* MQTT_SERVER = "192.168.1.100";  # Your MQTT broker IP
   ```

3. **Build and upload firmware**:
   ```bash
   cd edge_device
   pio run -t upload
   pio device monitor
   ```

4. **Calibrate load cell** (first-time setup):
   - Place a known weight on the load cell
   - Open Serial Monitor (115200 baud)
   - Note the raw reading
   - Calculate calibration factor: `calibration_factor = known_weight / raw_reading`
   - Update `LOADCELL_CALIBRATION_FACTOR` in `LoadCellSensor.h`

### Backend Setup

1. **Create Python virtual environment**:
   ```bash
   cd backend
   python -m venv venv
   
   # Windows
   venv\Scripts\activate
   
   # Linux/Mac
   source venv/bin/activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure InfluxDB connection** (edit `main.py`, matches `infrastructure/docker-compose.yml`):
   ```python
   INFLUXDB_URL = "http://localhost:8087"
   INFLUXDB_TOKEN = "<DOCKER_INFLUXDB_INIT_ADMIN_TOKEN from docker-compose.yml>"
   INFLUXDB_ORG = "soict"
   INFLUXDB_BUCKET = "telemetry_bucket"
   ```

4. **Run the MQTT worker** (writes ESP32 telemetry into InfluxDB):
   ```bash
   cd ../ai_and_workers/mqtt_worker
   python main.py
   ```

5. **Run the FastAPI server** (in a new terminal):
   ```bash
   python main.py
   # Or: uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

### Frontend Setup

1. **Install dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Configure API/MQTT endpoints** (edit `src/App.jsx`):
   ```javascript
   const MQTT_BROKER_URL = 'ws://localhost:9001';  // MQTT over WebSocket
   const API_BASE_URL = 'http://localhost:8000/api';
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   ```

### Infrastructure Setup

1. **Start all services with Docker Compose**:
   ```bash
   cd infrastructure
   docker-compose up -d
   ```

2. **Services included**:
   - **Mosquitto MQTT Broker** (port 1883, WebSocket 9001)
   - **InfluxDB** (port 8087, mapped from container port 8086)
   - **PostgreSQL** (port 5433) - reserved for a future patient/multi-bed feature, unused by the current pipeline

3. **InfluxDB is auto-initialized** by the `DOCKER_INFLUXDB_INIT_*` environment variables in
   `docker-compose.yml` (org `soict`, bucket `telemetry_bucket`, a pre-generated admin token) —
   no manual setup needed. Access the UI at `http://localhost:8087` if you want to browse the data.

## 🚀 Running the System

### Full System Startup

1. **Start infrastructure** (Mosquitto + InfluxDB):
   ```bash
   cd infrastructure
   docker-compose up -d
   ```

2. **Start MQTT worker**:
   ```bash
   cd ai_and_workers/mqtt_worker
   python main.py
   ```

3. **Start FastAPI backend** (new terminal):
   ```bash
   cd backend
   source venv/bin/activate
   python main.py
   ```

4. **Start frontend** (new terminal):
   ```bash
   cd frontend
   npm run dev
   ```

5. **Flash ESP32 firmware** and power on the device

6. **Access the dashboard**:
   - Open browser to `http://localhost:5173` (Vite dev server)
   - Real-time data should appear within seconds

### System Verification

1. **Check MQTT connection**:
   ```bash
   # Subscribe to telemetry topic
   mosquitto_sub -h localhost -t "ivdrip/telemetry" -v
   ```

2. **Check API health**:
   ```bash
   curl http://localhost:8000/api/health
   ```

3. **Query historical data**:
   ```bash
   curl http://localhost:8000/api/telemetry?start=-1h
   ```

## 🎮 Demo Mode

For testing without physical sensors, use the **Simulator Panel** built into the web dashboard itself
(`frontend/src/components/SimulatorPanel.jsx`): click "Start Simulation" to feed fake volume/BPM values
to the ESP32 over MQTT (`simulation_mode: true`). The firmware still runs its real PID loop and drives
the physical servo — only the sensor readings are faked, so it's still an end-to-end test of the control
loop and telemetry pipeline. Turn simulation off to resume reading the real IR drop sensor and load cell.

## 📚 API Documentation

### REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health check |
| GET | `/api/status` | Current device status |
| GET | `/api/telemetry` | Historical telemetry data |
| GET | `/api/telemetry/stats` | Statistical summary |
| GET | `/api/alerts` | Alert history |

### MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `ivdrip/telemetry` | ESP32 → Broker | Sensor data (JSON) |
| `ivdrip/status` | ESP32 → Broker | Device status updates |
| `ivdrip/cmd` | Broker → ESP32 | Control commands (`simulation_mode`, `sim_volume`, `sim_bpm`, `target_bpm`, `servo_angle`) |

### Telemetry JSON Format

```json
{
  "volume_ml": 250.5,
  "bpm": 62.3,
  "target_bpm": 60.0,
  "servo_angle": 45,
  "status": "normal",
  "rssi": -42,
  "free_heap": 245000,
  "uptime_ms": 3600000,
  "timestamp": 1704067200000
}
```

## 🔧 Troubleshooting

### Common Issues

1. **ESP32 won't connect to WiFi**
   - Verify SSID and password in `main.cpp`
   - Check WiFi signal strength (RSSI should be > -80 dBm)
   - Ensure 2.4GHz network (ESP32 doesn't support 5GHz)

2. **Load cell readings are unstable**
   - Check wiring connections
   - Ensure proper grounding
   - Increase filter size in `LoadCellSensor.h`
   - Recalibrate with known weights

3. **MQTT connection fails**
   - Verify MQTT broker is running: `docker ps`
   - Check broker IP address and port
   - Ensure firewall allows port 1883

4. **No data in dashboard**
   - Check browser console for errors
   - Verify MQTT WebSocket port (9001) is accessible
   - Ensure API server is running: `curl http://localhost:8000/api/health`

5. **Servo not responding**
   - Check 5V power supply (servos need external power)
   - Verify PWM pin connection
   - Test with servo sweep example sketch

### Debug Commands

```bash
# View ESP32 serial output
pio device monitor --port COM3 --baud 115200

# Check Docker containers
docker ps -a

# View MQTT messages
mosquitto_sub -h localhost -t "ivdrip/#" -v

# Check InfluxDB data
docker exec influxdb influx query "from(bucket:\"telemetry_bucket\") |> range(start: -1h)"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- ESP32 Arduino Core team
- PlatformIO community
- InfluxDB team
- React and Recharts contributors

---

**⚠️ Medical Disclaimer**: This system is for educational and research purposes only. It is NOT intended for actual medical use or patient monitoring without proper regulatory approval (FDA, CE, etc.). Always consult medical professionals for patient care.