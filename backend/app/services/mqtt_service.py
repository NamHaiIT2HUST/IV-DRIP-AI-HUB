import paho.mqtt.client as mqtt
import json
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
from app.core.config import settings

# Import vũ khí để chọc xuống PostgreSQL
from app.db.postgres import SessionLocal
from app.models.patient import Patient

# Khởi tạo InfluxDB
influx_client = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)

# Biến toàn cục (Thêm trường bed và name để mớm cho Frontend sau này)
latest_telemetry = {"device": "Đang kết nối...", "current": 0.0, "target": 0.0, "angle": 0.0, "bed": "--", "name": "Chưa rõ"}

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        device_id = payload.get("device")
        
        # --- ĐÂY LÀ TRÁI TIM CỦA HỆ THỐNG: KẾT HỢP DỮ LIỆU ---
        db = SessionLocal() # Mở kết nối với Postgres
        try:
            # Tra cứu xem thiết bị này đang gắn cho Bệnh nhân nào
            patient = db.query(Patient).filter(Patient.device_id == device_id, Patient.is_active == True).first()
            
            if patient:
                # Lấy lệnh của Bác sĩ ĐÈ LÊN dữ liệu của máy móc
                payload["target"] = patient.target_rate
                payload["bed"] = patient.bed_number
                payload["name"] = patient.full_name
            else:
                # Cảnh báo: Máy đang chạy nhưng chưa được gán cho bệnh nhân nào!
                payload["target"] = 0.0 
                payload["bed"] = "Trống"
                payload["name"] = "Vô danh"
        finally:
            db.close() # Xong việc phải đóng cửa DB ngay để tránh tràn bộ nhớ!
        # ------------------------------------------------------

        # Cập nhật dữ liệu đã được "tiêm" phác đồ lên Web
        latest_telemetry.update(payload) 
        
        # Bắn đạn vào InfluxDB (Lúc này InfluxDB sẽ lưu con số target CỦA BÁC SĨ)
        point = (
            Point("iv_drip_measurement")
            .tag("device_id", device_id) 
            .tag("bed_number", payload.get("bed", "unknown"))
            .field("current_rate", float(payload.get("current", 0)))
            .field("target_rate", float(payload.get("target", 0)))
            .field("valve_angle", float(payload.get("angle", 0)))
        )
        write_api.write(bucket=settings.INFLUX_BUCKET, org=settings.INFLUX_ORG, record=point)
        
    except Exception as e:
        print(f"Lỗi MQTT Service: {e}")

def start_mqtt():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    client.connect("127.0.0.1", 1883, 60)
    client.subscribe("hospital/telemetry/#")
    client.loop_start()
    print("📡 MQTT Service đã khởi động và đang lắng nghe...")
    return client