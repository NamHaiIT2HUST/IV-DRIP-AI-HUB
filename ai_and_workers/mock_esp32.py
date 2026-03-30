import paho.mqtt.client as mqtt
import time
import json
import random

# Cấu hình MQTT Broker (Mosquitto trên máy bạn)
BROKER = "localhost"
PORT = 1883
# ĐÃ SỬA LẠI TOPIC CHO KHỚP VỚI WORKER CỦA BẠN:
TOPIC = "hospital/telemetry/esp32_01" 

# Dùng api version 2 để không bị cảnh báo DeprecationWarning
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="Fake_ESP32")

def simulate():
    client.connect(BROKER, PORT)
    client.loop_start()
    
    print("🚀 Đang chạy giả lập ESP32... Ấn Ctrl+C để dừng.")
    
    try:
        while True:
            # Tạo dữ liệu giả lập (Tốc độ truyền dịch ngẫu nhiên)
            fake_rate = random.randint(30, 50)
            fake_angle = random.randint(0, 90)
            
            payload = {
                "device": "ESP_01",
                "current": fake_rate,
                "valve": fake_angle,
                "status": "Running"
            }
            
            # Đẩy lên Mosquitto
            client.publish(TOPIC, json.dumps(payload))
            print(f"💧 Đã gửi dữ liệu giả: {payload}")
            
            time.sleep(2) # 2 giây gửi 1 lần
            
    except KeyboardInterrupt:
        print("\n🛑 Đã tắt mạch giả lập.")
        client.loop_stop()

if __name__ == "__main__":
    simulate()