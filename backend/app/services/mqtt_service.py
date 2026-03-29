import paho.mqtt.client as mqtt
import json
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
from app.core.config import settings

# Khởi tạo InfluxDB
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)

# Biến toàn cục (Giữ nguyên)
latest_telemetry = {"device": "Đang kết nối...", "current": 0.0, "target": 0.0, "angle": 0.0}

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        
        # 🐛 VÁ LỖI Ở ĐÂY: Dùng .update() để nhét dữ liệu mới vào từ điển cũ 
        # Nhờ vậy file routes.py mới nhìn thấy sự thay đổi!
        latest_telemetry.update(payload) 
        
        # Bắn đạn vào InfluxDB
        point = (
            Point("iv_drip_measurement")
            .tag("device_id", payload.get("device", "unknown")) 
            .field("current_rate", float(payload.get("current", 0)))
            .field("target_rate", float(payload.get("target", 0)))
            .field("valve_angle", float(payload.get("angle", 0)))
        )
        write_api.write(bucket=settings.INFLUX_BUCKET, org=settings.INFLUX_ORG, record=point)
    except Exception as e:
        print(f"Lỗi MQTT Service: {e}")

def start_mqtt():
    """Hàm khởi động MQTT Client chạy ngầm"""
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    client.connect("127.0.0.1", 1883, 60)
    client.subscribe("hospital/telemetry/#")
    client.loop_start()
    print("📡 MQTT Service đã khởi động và đang lắng nghe...")
    return client