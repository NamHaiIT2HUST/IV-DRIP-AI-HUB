import paho.mqtt.client as mqtt
import json
import joblib
import pandas as pd
import warnings
import websocket  
import time

warnings.filterwarnings('ignore')

BROKER = "localhost"
PORT = 1883
TOPIC = "hospital/telemetry/#"
MODEL_PATH = "iv_drip_ai_model.pkl"
WS_URL = "ws://127.0.0.1:8000/ws/telemetry"

DIAGNOSIS_MAP = {
    0: "🟢 BÌNH THƯỜNG (An toàn)",
    1: "🔴 BÁO ĐỘNG: TẮC KIM / HẾT DỊCH!",
    2: "🟠 BÁO ĐỘNG: CHẢY QUÁ NHANH!"
}

def send_to_fastapi(data):
    try:
        ws = websocket.create_connection(WS_URL, timeout=1)
        ws.send(json.dumps(data))
        ws.close()
        print("Gửi thành công!") # Nếu muốn check thì bỏ comment dòng này
    except Exception as e:
        # Sửa dòng này để biết lỗi THẬT SỰ là gì:
        print(f"❌ LỖI KẾT NỐI: {e}")

try:
    print(f"🧠 Đang đánh thức AI từ file {MODEL_PATH}...")
    model = joblib.load(MODEL_PATH)
    print("✅ AI đã thức tỉnh! Bác sĩ trực ban đã sẵn sàng làm việc.")
except Exception as e:
    print(f"❌ CHÚ Ý: Không tìm thấy file {MODEL_PATH}.")
    exit(1)

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"📡 Đã kết nối MQTT. Đang túc trực tại: {TOPIC}")
    client.subscribe(TOPIC)

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        device_id = payload.get("device", "Unknown")
        current = payload.get("current", 0)
        valve = payload.get("valve", 0)

        patient_data = pd.DataFrame([[current, valve]], columns=['current_rate', 'valve_angle'])
        prediction = int(model.predict(patient_data)[0]) # Chuyển về int để JSON dễ đọc
        
        diagnosis = DIAGNOSIS_MAP.get(prediction, "Chưa rõ bệnh")
        print(f"🏥 [Giường {device_id}] Tốc độ: {current:02d} | Van: {valve:02d} => {diagnosis}")

        payload_to_web = {
            "room_id": device_id, 
            "rate": current,
            "valve": valve,
            "status": prediction,
            "timestamp": time.time()
        }
        send_to_fastapi(payload_to_web)
        
    except Exception as e:
        print(f"⚠️ Lỗi xử lý tin nhắn: {e}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="AI_Doctor_01")
client.on_connect = on_connect
client.on_message = on_message

client.connect(BROKER, PORT)
client.loop_forever()