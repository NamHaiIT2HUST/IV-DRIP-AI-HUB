import paho.mqtt.client as mqtt
import json
import joblib
import pandas as pd
import warnings

# Tắt các cảnh báo lặt vặt của thư viện để Terminal hiển thị sạch đẹp
warnings.filterwarnings('ignore')

# ==========================================
# 1. CẤU HÌNH HỆ THỐNG
# ==========================================
BROKER = "localhost"
PORT = 1883
TOPIC = "hospital/telemetry/#"
MODEL_PATH = "iv_drip_ai_model.pkl" # Đảm bảo file này nằm cùng thư mục hoặc trỏ đúng đường dẫn

# Từ điển dịch mã bệnh của AI sang tiếng người
DIAGNOSIS_MAP = {
    0: "🟢 BÌNH THƯỜNG (An toàn)",
    1: "🔴 BÁO ĐỘNG: TẮC KIM / HẾT DỊCH!",
    2: "🟠 BÁO ĐỘNG: CHẢY QUÁ NHANH!"
}

# ==========================================
# 2. KHỞI ĐỘNG "BỘ NÃO"
# ==========================================
try:
    print(f"🧠 Đang đánh thức AI từ file {MODEL_PATH}...")
    model = joblib.load(MODEL_PATH)
    print("✅ AI đã thức tỉnh! Bác sĩ trực ban đã sẵn sàng làm việc.")
except Exception as e:
    print(f"❌ CHÚ Ý: Không tìm thấy file {MODEL_PATH}.")
    print("Hãy copy file iv_drip_ai_model.pkl bạn vừa train vào cùng thư mục với file ai_worker.py nhé!")
    exit(1)

# ==========================================
# 3. KỸ NĂNG KHÁM BỆNH (XỬ LÝ MQTT)
# ==========================================
def on_connect(client, userdata, flags, reason_code, properties):
    print(f"📡 Đã kết nối bộ đàm MQTT. Đang túc trực tại phòng: {TOPIC}")
    print("-" * 60)
    client.subscribe(TOPIC)

def on_message(client, userdata, msg):
    try:
        # Nhận hồ sơ bệnh án từ ESP32 (hoặc mạch giả lập)
        payload = json.loads(msg.payload.decode('utf-8'))
        device_id = payload.get("device", "Unknown")
        current = payload.get("current", 0)
        valve = payload.get("valve", 0)
        
        # Đóng gói dữ liệu y hệt như lúc đi học (train) để AI không bỡ ngỡ
        patient_data = pd.DataFrame([[current, valve]], columns=['current_rate', 'valve_angle'])
        
        # Bắt mạch (Dự đoán)
        prediction = model.predict(patient_data)[0]
        diagnosis = DIAGNOSIS_MAP.get(prediction, "Chưa rõ bệnh")
        
        # In kết quả ra màn hình
        print(f"🏥 [Giường {device_id}] Tốc độ: {current:02d} | Van: {valve:02d} => {diagnosis}")
        
        # 💡 SAU NÀY BẠN CÓ THỂ CODE THÊM Ở ĐÂY:
        # Nếu prediction == 1 hoặc 2:
        #   - Gửi tin nhắn Telegram cho y tá
        #   - Bắn tín hiệu MQTT ngược lại cho ESP32 để đóng van tự động / hú còi
        
    except Exception as e:
        print(f"⚠️ Dữ liệu nhiễu, không khám được: {e}")

# ==========================================
# 4. GIAO CA TRỰC
# ==========================================
# Dùng VERSION2 để khắc phục lỗi DeprecationWarning bạn gặp lúc trước
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="AI_Doctor_01")
client.on_connect = on_connect
client.on_message = on_message

client.connect(BROKER, PORT)
client.loop_forever()