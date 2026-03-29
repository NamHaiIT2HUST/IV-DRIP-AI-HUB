import paho.mqtt.client as mqtt
import time
import json
import random

# Danh sách toàn bộ thiết bị trong viện
DEVICES = ["ESP_01", "ESP_02", "ESP_03", "ESP_04"]
target_rates = {dev: 0.0 for dev in DEVICES} # Ban đầu tắt hết
current_rates = {dev: 0.0 for dev in DEVICES}

# Lắng nghe lệnh từ Bác sĩ cho TẤT CẢ các máy
def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        # Tách lấy phần cuối cùng của topic (Ví dụ: commands/ESP_02 -> lấy ESP_02)
        dev_id = msg.topic.split("/")[-1] 
        
        if "target_rate" in payload:
            target_rates[dev_id] = payload["target_rate"]
            print(f"🔔 [{dev_id}] Nhận lệnh phác đồ mới: {payload['target_rate']} bpm")
    except Exception as e: 
        print(f"❌ Lỗi xử lý lệnh: {e}")

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_message = on_message
client.connect("127.0.0.1", 1883, 60)

# Theo dõi tất cả các kênh lệnh
for dev in DEVICES:
    client.subscribe(f"commands/{dev}")
client.loop_start()

print("🚀 [HỆ THỐNG GIẢ LẬP TỔNG] Đã bật 4 máy truyền dịch (ESP_01 -> ESP_04).")

try:
    while True:
        for dev in DEVICES:
            # Nếu máy đang bị tắt (target = 0), thì bỏ qua không gửi data
            if target_rates[dev] <= 0:
                continue

            # Tính toán chỉ số cho từng máy
            noise = random.uniform(-1.5, 1.5)
            current_rates[dev] = target_rates[dev] + noise
            valve = min(target_rates[dev] * 0.6 + random.uniform(-2, 2), 90.0)

            # Bắn đạn lên Backend
            payload = {
                "device": dev,
                "current": round(current_rates[dev], 1),
                "target": round(target_rates[dev], 1), 
                "angle": round(valve, 1)
            }
            client.publish(f"hospital/telemetry/{dev}", json.dumps(payload))
            
        time.sleep(1) # Cả trại cảm biến nghỉ 1 giây rồi bắn tiếp
except KeyboardInterrupt:
    print("\n🛑 Đã tắt nguồn toàn bộ thiết bị.")
    client.disconnect()