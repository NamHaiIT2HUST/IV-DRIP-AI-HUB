"""
MQTT Worker - Subscribes to ESP32 telemetry and writes to InfluxDB.

This module runs as a background worker that:
1. Connects to the MQTT broker
2. Subscribes to IV drip telemetry topics
3. Parses incoming JSON payloads
4. Writes data points to InfluxDB for historical storage
"""

import json
import time
import signal
import sys
from typing import Optional, Dict, Any
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from loguru import logger

# Configuration from environment or defaults
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC = "ivdrip/telemetry"
MQTT_USER = "ivdrip"
MQTT_PASS = "ivdrip123"

INFLUXDB_URL = "http://localhost:8086"
INFLUXDB_TOKEN = "ivdrip-token"
INFLUXDB_ORG = "ivdrip-org"
INFLUXDB_BUCKET = "ivdrip-data"

# Global flag for graceful shutdown
running = True


def signal_handler(sig, frame):
    """Handle interrupt signals for graceful shutdown."""
    global running
    logger.info("Shutdown signal received...")
    running = False


def create_influxdb_client() -> Optional[InfluxDBClient]:
    """Create and return an InfluxDB client."""
    try:
        client = InfluxDBClient(
            url=INFLUXDB_URL,
            token=INFLUXDB_TOKEN,
            org=INFLUXDB_ORG,
            verify_ssl=False
        )
        
        # Test connection
        health = client.health()
        logger.info(f"InfluxDB connection status: {health.status}")
        
        return client
    except Exception as e:
        logger.error(f"Failed to connect to InfluxDB: {e}")
        return None


def on_connect(client, userdata, flags, rc):
    """MQTT connection callback."""
    if rc == 0:
        logger.info("Connected to MQTT broker successfully!")
        client.subscribe(MQTT_TOPIC)
        logger.info(f"Subscribed to topic: {MQTT_TOPIC}")
    else:
        logger.error(f"Failed to connect to MQTT broker, return code: {rc}")


def on_disconnect(client, userdata, rc):
    """MQTT disconnection callback."""
    if rc != 0:
        logger.warning("Unexpected MQTT disconnection. Reconnecting...")


def on_message(client, userdata, msg):
    """
    MQTT message callback.
    Processes incoming telemetry data and writes to InfluxDB.
    """
    try:
        # Parse JSON payload
        payload = json.loads(msg.payload.decode('utf-8'))
        
        # Extract values with defaults
        volume_ml: float = payload.get('volume_ml', 0.0)
        bpm: float = payload.get('bpm', 0.0)
        target_bpm: float = payload.get('target_bpm', 60.0)
        servo_angle: int = payload.get('servo_angle', 45)
        status: str = payload.get('status', 'unknown')
        rssi: int = payload.get('rssi', 0)
        free_heap: int = payload.get('free_heap', 0)
        uptime_ms: int = payload.get('uptime_ms', 0)
        
        # Use server time if timestamp not provided
        timestamp = payload.get('timestamp', int(time.time() * 1000))
        
        # Create InfluxDB point
        point = (
            Point("iv_drip")
            .tag("device_id", "esp32_ivdrip_001")
            .tag("status", status)
            .field("volume_ml", volume_ml)
            .field("bpm", bpm)
            .field("target_bpm", target_bpm)
            .field("servo_angle", servo_angle)
            .field("rssi", rssi)
            .field("free_heap", free_heap)
            .field("uptime_ms", uptime_ms)
            .time(timestamp, WritePrecision.MS)
        )
        
        # Write to InfluxDB
        write_api = userdata.get('write_api')
        if write_api:
            write_api.write(bucket=INFLUXDB_BUCKET, record=point)
            logger.debug(f"Written data: volume={volume_ml}mL, bpm={bpm}, status={status}")
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse MQTT message: {e}")
    except Exception as e:
        logger.error(f"Error processing message: {e}")


def main():
    """Main entry point for the MQTT worker."""
    global running
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("Starting MQTT Worker...")
    logger.info(f"MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
    logger.info(f"InfluxDB: {INFLUXDB_URL}")
    
    # Create InfluxDB client
    influx_client = create_influxdb_client()
    if not influx_client:
        logger.error("Could not connect to InfluxDB. Exiting.")
        sys.exit(1)
    
    # Create write API
    write_api = influx_client.write_api(write_options=SYNCHRONOUS)
    
    # Setup MQTT client
    mqtt_client = mqtt.Client(client_id="ivdrip_mqtt_worker")
    mqtt_client.on_connect = on_connect
    mqtt_client.on_disconnect = on_disconnect
    mqtt_client.on_message = on_message
    
    # Store InfluxDB resources in userdata
    mqtt_client.user_data_set({
        'write_api': write_api,
        'influx_client': influx_client
    })
    
    # Set authentication if provided
    if MQTT_USER and MQTT_PASS:
        mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
    
    # Connect to MQTT broker
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    except Exception as e:
        logger.error(f"Failed to connect to MQTT broker: {e}")
        influx_client.close()
        sys.exit(1)
    
    # Start MQTT loop
    mqtt_client.loop_start()
    logger.info("MQTT Worker started. Press Ctrl+C to stop.")
    
    # Main loop
    try:
        while running:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received.")
    finally:
        # Cleanup
        logger.info("Shutting down...")
        mqtt_client.loop_stop()
        mqtt_client.disconnect()
        write_api.close()
        influx_client.close()
        logger.info("MQTT Worker stopped.")


if __name__ == "__main__":
    main()