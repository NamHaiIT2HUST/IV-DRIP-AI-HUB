import paho.mqtt.client as mqtt
import time
import json
import random

BROKER = "localhost"
PORT = 1883

PUB_TOPIC = "hospital/telemetry/ESP_01" 
SUB_TOPIC = "hospital/command/ESP_01" 

current_target = 45.0

def on_message(client, userdata, msg):
    global current_target
    try:
        raw_data = msg.payload.decode('utf-8')
        try:
            data = json.loads(raw_data)
            if "target_rate" in data:
                current_target = float(data["target_rate"])
        except json.JSONDecodeError:
            current_target = float(raw_data)

        print(f"\n🎯 [MẠCH ESP32] ĐÃ NHẬN LỆNH: Chuyển mục tiêu thành {current_target} bpm")
    except Exception as e:
        pass

def on_connect(client, userdata, flags, reason_code, properties):
    print(f"📡 Mạch đã kết nối. Đang vểnh tai nghe lệnh tại: {SUB_TOPIC}")
    client.subscribe(SUB_TOPIC)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="Fake_ESP32_Notification_Test")
client.on_connect = on_connect
client.on_message = on_message

def simulate():
    client.connect(BROKER, PORT)
    client.loop_start()
    
    print("🚀 ĐANG CHẠY KỊCH BẢN TEST CẢNH BÁO...")
    
    cycle = 0 # Biến đếm nhịp để đổi trạng thái
    
    try:
        while True:
            # --- KỊCH BẢN 3 TRẠNG THÁI ---
            if cycle < 5: 
                # 🟢 BÌNH THƯỜNG (Xanh)
                fake_rate = current_target + random.uniform(-1.5, 1.5)
                ai_status = 0
                state_text = "🟢 BÌNH THƯỜNG"
            elif cycle < 10: 
                # 🔴 TẮC KIM (Đỏ) - Tốc độ rớt thê thảm
                fake_rate = random.uniform(8.0, 12.0)
                ai_status = 1
                state_text = "🔴 TẮC KIM"
            else: 
                # 🟡 CHẢY NHANH (Vàng) - Tốc độ vọt lên nóc
                fake_rate = random.uniform(85.0, 95.0)
                ai_status = 2
                state_text = "🟡 CHẢY NHANH"
                
            if fake_rate < 0: fake_rate = 0.0
            
            payload = {
                "device": "ESP_01",
                "current": round(fake_rate, 1),
                "valve": random.randint(40, 60),
                "status": ai_status # QUAN TRỌNG: Gửi số 0, 1, 2 để Web bắt sóng
            }
            
            client.publish(PUB_TOPIC, json.dumps(payload))
            print(f"💧 [Vòng {cycle}] {state_text} | Gửi: {payload['current']} bpm | Status: {ai_status}")
            
            cycle += 1
            if cycle >= 15: cycle = 0 # Lặp lại kịch bản
                
            time.sleep(2) 
            
    except KeyboardInterrupt:
        print("\n🛑 Đã tắt mạch giả lập.")
        client.loop_stop()

if __name__ == "__main__":
    simulate()