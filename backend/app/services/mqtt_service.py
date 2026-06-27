import paho.mqtt.client as mqtt
import json
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
from app.core.config import settings
from app.db.postgres import SessionLocal
from app.models.patient import Patient
from app.services.ai_engine import ai_analyzer

influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)

# 🐛 SỬA: Biến này giờ là một kho lưu trữ cho TẤT CẢ thiết bị
latest_telemetry = {} 

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        device_id = payload.get("device_id")
        if not device_id: return
        
        current_rate = float(payload.get("bpm", 0))
        valve_angle = float(payload.get("servo_angle", 0))
        
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

        # 2. ĐƯA DỮ LIỆU QUA AI
        ai_code, ai_message = ai_analyzer.analyze(current_rate, payload.get("target", 0), valve_angle)
        payload["ai_code"] = ai_code
        payload["ai_message"] = ai_message

        # 3. Cập nhật vào kho lưu trữ theo ID thiết bị
        # 🐛 SỬA: Lưu riêng cho từng máy để không bị đè dữ liệu
        latest_telemetry[device_id] = payload 
        
        # 4. Ghi vào InfluxDB
        point = (
            Point("iv_drip")
            .tag("device_id", device_id) 
            .tag("bed_number", payload.get("bed", "unknown"))
            .tag("ai_status", ai_code)
            .field("volume_ml", float(payload.get("volume_ml", 0)))
            .field("bpm", current_rate)
            .field("target_bpm", float(payload.get("target", 0)))
            .field("servo_angle", valve_angle)
        )
        write_api.write(bucket=settings.INFLUX_BUCKET, org=settings.INFLUX_ORG, record=point)
        
    except Exception as e:
        print(f"❌ Lỗi MQTT Service: {e}")

mqtt_client_instance = None

def start_mqtt():
    global mqtt_client_instance
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    client.connect("127.0.0.1", 1883, 60)
    # Lắng nghe tất cả telemetry từ các máy
    client.subscribe("ivdrip/telemetry")
    client.loop_start()
    mqtt_client_instance = client
    print("📡 MQTT Service đã khởi động (Multi-device mode)...")
    return client

def send_mqtt_command(device_id: str, new_target: float):
    if mqtt_client_instance:
        # 🐛 ĐẢM BẢO TOPIC NÀY KHỚP VỚI FILE MOCK
        topic = f"ivdrip/control/{device_id}"
        payload = json.dumps({"target_rate": new_target})
        mqtt_client_instance.publish(topic, payload)
        print(f"🔫 Đã bắn lệnh {new_target} bpm xuống {device_id}")
        return True
    return False