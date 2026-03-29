import json
import paho.mqtt.client as mqtt
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

# --- CẤU HÌNH INFLUXDB (Khớp 100% với docker-compose của Nam Hải) ---
INFLUX_URL = "http://localhost:8087"
INFLUX_TOKEN = "aEyoAt8SbmDUhu_x6G2TEpsW2ecxDJJzrHBNBJXsfD8Blnx1hVlMibpjU02MFKD1bSg_KQLt3JK9AI3vSOXlAw=="
INFLUX_ORG = "soict"
INFLUX_BUCKET = "telemetry_bucket"

client_influx = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
write_api = client_influx.write_api(write_options=SYNCHRONOUS)

# --- CẤU HÌNH MQTT ---
MQTT_BROKER = "127.0.0.1"
MQTT_PORT = 1883
MQTT_TOPIC = "hospital/telemetry/#"

def on_connect(client, userdata, flags, rc):
    print(f"✅ Đã kết nối MQTT Broker. Đang nghe tại: {MQTT_TOPIC}")
    client.subscribe(MQTT_TOPIC)

def on_message(client, userdata, msg):
    try:
        # Bóc tách JSON
        payload = json.loads(msg.payload.decode("utf-8"))
        device_id = payload.get("device", "Unknown")
        current_rate = float(payload.get("current", 0))
        target_rate = float(payload.get("target", 0))
        valve_angle = float(payload.get("angle", 0))

        # Đóng gói chuẩn InfluxDB
        point = (
            Point("iv_telemetry")
            .tag("device_id", device_id)
            .field("current_rate", current_rate)
            .field("target_rate", target_rate)
            .field("valve_angle", valve_angle)
        )
        
        # Ghi vào kho telemetry_bucket
        write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=point)
        print(f"💾 LƯU INFLUXDB -> [{device_id}] Current: {current_rate} | Valve: {valve_angle}")

    except Exception as e:
        print(f"❌ Lỗi: {e}")

# Khởi động Worker
mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

print("🚀 Worker InfluxDB đang khởi động...")
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
mqtt_client.loop_forever()