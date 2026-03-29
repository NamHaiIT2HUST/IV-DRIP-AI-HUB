import paho.mqtt.client as mqtt
import json
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
from app.core.config import settings

# Import vũ khí để chọc xuống PostgreSQL
from app.db.postgres import SessionLocal
from app.models.patient import Patient
from app.services.ai_engine import ai_analyzer

# Khởi tạo InfluxDB
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)

# Biến toàn cục (Thêm trường bed và name để mớm cho Frontend sau này)
latest_telemetry = {
    "device": "Đang kết nối...", "current": 0.0, "target": 0.0, 
    "angle": 0.0, "bed": "--", "name": "Chưa rõ",
    "ai_code": "WAIT", "ai_message": "Đang chờ kết nối..." 
}

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        device_id = payload.get("device")
        current_rate = float(payload.get("current", 0))
        valve_angle = float(payload.get("angle", 0))
        
        # 1. Ghép nối dữ liệu từ PostgreSQL
        db = SessionLocal()
        try:
            patient = db.query(Patient).filter(Patient.device_id == device_id, Patient.is_active == True).first()
            if patient:
                payload["target"] = patient.target_rate
                payload["bed"] = patient.bed_number
                payload["name"] = patient.full_name
            else:
                payload["target"] = 0.0 
                payload["bed"] = "Trống"
                payload["name"] = "Vô danh"
        finally:
            db.close()

        # 2. ĐƯA DỮ LIỆU QUA BỘ NÃO AI ĐỂ CHẨN ĐOÁN
        ai_code, ai_message = ai_analyzer.analyze(current_rate, payload["target"], valve_angle)
        payload["ai_code"] = ai_code
        payload["ai_message"] = ai_message

        # 3. Cập nhật và lưu lại
        latest_telemetry.update(payload) 
        
        point = (
            Point("iv_drip_measurement")
            .tag("device_id", device_id) 
            .tag("bed_number", payload.get("bed", "unknown"))
            .tag("ai_status", ai_code) # Lưu cả trạng thái AI vào DB để học máy sau này!
            .field("current_rate", current_rate)
            .field("target_rate", float(payload.get("target", 0)))
            .field("valve_angle", valve_angle)
        )
        write_api.write(bucket=settings.INFLUX_BUCKET, org=settings.INFLUX_ORG, record=point)
        
    except Exception as e:
        print(f"Lỗi MQTT Service: {e}")

mqtt_client_instance = None

def start_mqtt():
    global mqtt_client_instance
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    client.connect("127.0.0.1", 1883, 60)
    client.subscribe("hospital/telemetry/#")
    client.loop_start()
    
    mqtt_client_instance = client # Lưu lại vào biến toàn cục
    print("📡 MQTT Service đã khởi động và đang lắng nghe...")
    return client

def send_mqtt_command(device_id: str, new_target: float):
    """Hàm dùng để bắn lệnh từ Backend xuống ESP32"""
    if mqtt_client_instance:
        topic = f"hospital/command/{device_id}"
        payload = json.dumps({"target_rate": new_target})
        mqtt_client_instance.publish(topic, payload)
        print(f"🔫 Đã bắn lệnh {new_target} bpm xuống {device_id}")
        return True
    return False