#giả lập esp32
import time
import json
import random
import paho.mqtt.client as mqtt

# Cấu hình MQTT Broker (Đang chạy bằng Docker ở localhost)
BROKER = "127.0.0.1"
PORT = 1883
DEVICE_ID = "ESP_01"
TOPIC = f"hospital/telemetry/{DEVICE_ID}"

# Thông số giả lập
target_rate = 45.0
current_rate = 45.0
valve_angle = 90.0

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"[*] Đã kết nối tới MQTT Broker {BROKER} với mã: {reason_code}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_connect = on_connect
client.connect(BROKER, PORT, 60)

client.loop_start()

print(f"[*] Bắt đầu phát sóng giả lập từ thiết bị {DEVICE_ID}...")
try:
    while True:
        # Sinh nhiễu ngẫu nhiên để giống giọt nước rơi thật (+/- 1.5 giọt)
        noise = random.uniform(-1.5, 1.5)
        current_rate = target_rate + noise
        
        # Góc van cũng dao động nhẹ
        valve_angle += random.uniform(-0.5, 0.5)

        # Đóng gói JSON
        payload = {
            "device": DEVICE_ID,
            "target": round(target_rate, 1),
            "current": round(current_rate, 1),
            "angle": round(valve_angle, 1),
            "status": "active"
        }
        
        # Publish lên topic
        client.publish(TOPIC, json.dumps(payload))
        print(f"[PUBLISH] {TOPIC} -> {payload}")
        
        time.sleep(1) # Bắn 1 giây/lần

except KeyboardInterrupt:
    print("\n[!] Dừng giả lập.")
    client.loop_stop()
    client.disconnect()