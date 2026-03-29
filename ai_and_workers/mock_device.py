import paho.mqtt.client as mqtt
import time
import json
import random

DEVICE_ID = "ESP_01"
BROKER = "127.0.0.1"
PORT = 1883

# Trạng thái hiện tại của thiết bị (mặc định lúc mới bật máy)
current_rate = 0.0
target_rate = 45.0 
valve_angle = 0.0

# --- CÁI TAI ĐỂ NGHE LỆNH TỪ BACKEND ---
def on_message(client, userdata, msg):
    global target_rate
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        if "target_rate" in payload:
            new_target = payload["target_rate"]
            print(f"\n🔔 [BÍP BÍP] NHẬN LỆNH TỪ BÁC SĨ: Đổi phác đồ sang {new_target} bpm\n")
            target_rate = new_target # Máy lập tức ghi nhận phác đồ mới
    except Exception as e:
        print(f"Lỗi nhận lệnh: {e}")

# Khởi tạo súng MQTT
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_message = on_message
client.connect(BROKER, PORT, 60)

# Đăng ký nghe lén đúng cái kênh mà Backend sẽ bắn lệnh xuống
client.subscribe(f"hospital/command/{DEVICE_ID}")
client.loop_start()

print(f"🚀 Thiết bị {DEVICE_ID} ĐÃ BẬT. Đang chờ kết nối...")

try:
    while True:
        # Mô phỏng thuật toán PID (Thiết bị vật lý cố gắng ép current_rate đuổi theo target_rate)
        noise = random.uniform(-1.5, 1.5) # Nhiễu rung lắc tự nhiên
        
        # Van cơ (Servo) mở to nhỏ tỷ lệ thuận với tốc độ yêu cầu
        valve_angle = target_rate * 1.5 + random.uniform(-2, 2)
        if valve_angle > 90: valve_angle = 90.0 # Mở tối đa 90 độ
        
        # Nước chảy thực tế
        current_rate = target_rate + noise

        # Đóng gói dữ liệu báo cáo về trung tâm
        payload = {
            "device": DEVICE_ID,
            "current": round(current_rate, 1),
            "target": round(target_rate, 1), 
            "angle": round(valve_angle, 1)
        }
        
        client.publish(f"hospital/telemetry/{DEVICE_ID}", json.dumps(payload))
        print(f"📤 [CẢM BIẾN] Đang chảy: {payload['current']} bpm | Van: {payload['angle']}°")
        
        time.sleep(1) # Báo cáo 1 giây 1 lần
except KeyboardInterrupt:
    print("\n🛑 Đã tắt nguồn thiết bị.")
    client.disconnect()