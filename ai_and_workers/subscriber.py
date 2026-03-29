import paho.mqtt.client as mqtt

# Cấu hình bưu điện MQTT (localhost)
BROKER = "127.0.0.1"
PORT = 1883
TOPIC = "hospital/telemetry/#" # Dấu # nghĩa là nghe lén TẤT CẢ các thiết bị

# Hàm này sẽ được gọi tự động mỗi khi có tin nhắn bay tới
def on_message(client, userdata, msg):
    print(f"\n[📥 TING TING] Có tin nhắn từ Topic: {msg.topic}")
    print(f"Nội dung: {msg.payload.decode('utf-8')}")

# Khởi tạo Client bản mới nhất (Sửa luôn lỗi DeprecationWarning)
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
client.on_message = on_message

print(f"[*] Đang kết nối tới MQTT Broker ở {BROKER}...")
client.connect(BROKER, PORT, 60)

print(f"[*] Đang dóng tai nghe lén tại Topic: {TOPIC}")
client.subscribe(TOPIC)

# Giữ cho script chạy liên tục để hứng dữ liệu
try:
    client.loop_forever()
except KeyboardInterrupt:
    print("\n[!] Đã ngắt kết nối.")