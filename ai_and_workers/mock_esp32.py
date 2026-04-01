import paho.mqtt.client as mqtt
import time
import json
import random

BROKER = "localhost"
PORT = 1883

# Ống nước gửi dữ liệu LÊN web
PUB_TOPIC = "hospital/telemetry/ESP_01" 
# Ống nước nhận lệnh TỪ web XUỐNG
SUB_TOPIC = "hospital/command/ESP_01" 

# Biến toàn cục lưu mục tiêu hiện tại
current_target = 45.0

# Hàm chạy khi có lệnh từ Web gửi xuống
def on_message(client, userdata, msg):
    global current_target
    try:
        # Đọc dữ liệu Backend gửi (có thể là số thô như 60.0 hoặc chuỗi JSON)
        raw_data = msg.payload.decode('utf-8')
        try:
            data = json.loads(raw_data)
            if "target_rate" in data:
                current_target = float(data["target_rate"])
        except json.JSONDecodeError:
            current_target = float(raw_data)

        print(f"🎯 [MẠCH ESP32] ĐÃ NHẬN LỆNH TỪ BÁC SĨ: Chuyển mục tiêu thành {current_target} bpm")
    except Exception as e:
        print(f"⚠️ Lỗi không hiểu lệnh từ Web: {e}")

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"📡 Mạch giả lập đã kết nối. Đang vểnh tai nghe lệnh tại: {SUB_TOPIC}")
    client.subscribe(SUB_TOPIC) # Bắt đầu lắng nghe

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="Fake_ESP32_Advanced")
client.on_connect = on_connect
client.on_message = on_message

def simulate():
    client.connect(BROKER, PORT)
    client.loop_start() # Chạy vòng lặp ngầm để luôn nghe ngóng lệnh mới
    
    print("🚀 Đang chạy mạch ESP32 thông minh... Ấn Ctrl+C để dừng.")
    
    try:
        while True:
            # LUÔN LUÔN bám sát mục tiêu hiện tại (chỉ sai số nhẹ tự nhiên từ -2 đến +2)
            # Không còn trò chơi khăm rớt xuống 10 nữa!
            fake_rate = current_target + random.uniform(-2.5, 2.5)
            
            # Đảm bảo giọt không bị âm
            if fake_rate < 0: 
                fake_rate = 0.0
                
            fake_angle = random.randint(40, 60) # Góc van bình thường
            
            payload = {
                "device": "ESP_01",
                "current": round(fake_rate, 1),
                "valve": fake_angle,
                "status": "Running"
            }
            
            client.publish(PUB_TOPIC, json.dumps(payload))
            print(f"💧 Đang truyền: {payload['current']} bpm (Mục tiêu cài đặt: {current_target})")
            
            time.sleep(2) 
            
    except KeyboardInterrupt:
        print("\n🛑 Đã tắt mạch giả lập.")
        client.loop_stop()

if __name__ == "__main__":
    simulate()