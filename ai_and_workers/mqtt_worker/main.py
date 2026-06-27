import json
import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

INFLUX_URL = "http://localhost:8087"
INFLUX_TOKEN = "L-Xz9sxCt6nxdlNJJsWMRoXSNGeKgI5z0_6dv_J2HQw4evAix-ry6x0SraDPjCYjtDHQBtj0BU8CAFAQm5QYVw=="
INFLUX_ORG = "soict"
INFLUX_BUCKET = "telemetry_bucket"

client_influx = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
write_api = client_influx.write_api(write_options=SYNCHRONOUS)

MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
MQTT_TOPIC = "ivdrip/telemetry"

def on_connect(client, userdata, flags, rc):
    print(f"✅ Đã kết nối MQTT Broker. Đang nghe tại: {MQTT_TOPIC}")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        device_id = payload.get("device_id", "Unknown")
        current_rate = float(payload.get("bpm", 0))
        target_rate = float(payload.get("target_bpm", 0))
        valve_angle = float(payload.get("servo_angle", 0))
        volume_ml = float(payload.get("volume_ml", 0))

        point = (
            Point("iv_drip")
            .tag("device_id", device_id)
            .field("bpm", current_rate)
            .field("target_bpm", target_rate)
            .field("servo_angle", valve_angle)
            .field("volume_ml", volume_ml)
        )

        write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=point)
        print(f"💾 LƯU INFLUXDB -> [{device_id}] Current: {current_rate} | Valve: {valve_angle}")

    except Exception as e:
        print(f"❌ Lỗi: {e}")

mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

print("🚀 Worker InfluxDB đang khởi động...")
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
mqtt_client.loop_forever()