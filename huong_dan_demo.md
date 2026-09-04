# HƯỚNG DẪN KHỞI CHẠY DEMO HỆ THỐNG IV-DRIP-AI-HUB

Tài liệu này hướng dẫn chi tiết cách khởi chạy toàn bộ hệ thống Hardware-in-the-Loop (HIL) của dự án **IV Drip AI Hub** phục vụ cho việc chạy thử nghiệm và demo.

---

## 🛠️ Kiến trúc các thành phần cần bật
Toàn bộ hệ thống chạy khép kín theo luồng:
1. **MQTT Broker (Docker - Mosquitto):** Trạm trung chuyển dữ liệu giữa Web và ESP32.
2. **InfluxDB (Docker):** Cơ sở dữ liệu lưu lịch sử truyền dịch.
3. **ESP32-S3 Firmware (PlatformIO):** Thiết bị Edge chạy thuật toán đánh giá an toàn & PID.
4. **Python Worker:** Thu thập dữ liệu từ MQTT lưu vào InfluxDB.
5. **FastAPI Backend:** API đọc dữ liệu từ InfluxDB cung cấp cho giao diện.
6. **Vite + ReactJS Frontend:** Giao diện điều khiển Cockpit trực quan, giám sát thời gian thực.

---

## 🚀 Các bước khởi chạy chi tiết

### BƯỚC 1: Khởi động Docker (Database & MQTT Broker)
Mở terminal tại thư mục dự án và chạy Docker Compose để bật InfluxDB và Mosquitto:
```bash
docker-compose -f infrastructure/docker-compose.yml up -d
```
*Kiểm tra:* Đảm bảo Docker Desktop đã chạy. Lệnh này sẽ mở các cổng `1883` (MQTT), `9001` (MQTT WebSockets) và `8087` (InfluxDB UI).

---

### BƯỚC 2: Cắm mạch ESP32-S3 & Nạp Code
1. Cắm cáp kết nối mạch ESP32-S3 vào cổng USB máy tính.
2. Nạp code mới nhất (đã tự động nhận diện IP WiFi mới `172.20.10.5` của bạn) bằng lệnh:
```bash
cd edge_device
pio run -t upload
```
*Lưu ý:* Code này đã biên dịch sẵn nên nạp cực nhanh. Hãy đảm bảo máy tính đang phát hoặc kết nối mạng Wi-Fi tên `NDNH` (Mật khẩu: `00112233`) để mạch có thể bắt được sóng và kết nối đến máy tính.

---

### BƯỚC 3: Chạy Python Worker (MQTT to DB)
Bật một terminal mới, chuyển đến thư mục chứa Worker và chạy:
```bash
cd ai_and_workers/mqtt_worker
python main.py
```
*Kiểm tra:* Khi chạy thành công, terminal sẽ in ra các dòng:
`💾 LƯU INFLUXDB -> [iv_drip_01] Current: ... | Valve: ... | Status: ...` mỗi khi nhận gói tin từ ESP32.

---

### BƯỚC 4: Chạy Backend API (FastAPI)
Bật một terminal mới, chuyển đến thư mục Backend và khởi động server uvicorn:
```bash
cd backend
python main.py
```
*Hoặc nếu muốn chạy có reload tự động:*
```bash
uvicorn main:app --reload --port 8000
```
*Kiểm tra:* Truy cập `http://localhost:8000/api/health` trên trình duyệt thấy trả về JSON `"status": "healthy"`.

---

### BƯỚC 5: Khởi chạy React Frontend (Web Dashboard)
Bật một terminal mới, chuyển đến thư mục Frontend, cài đặt thư viện (nếu chưa có) và chạy dev server:
```bash
cd frontend
npm run dev
```
*Kiểm tra:* Nhấp vào đường dẫn `http://localhost:5173` để mở giao diện Web Dashboard toàn màn hình.

---

## 🎯 Kịch bản Demo thực tế trên Giao diện

1. **Khởi chạy bình thường:**
   * Nhấn nút **Start Simulation** trên giao diện điều khiển.
   * Kéo thanh trượt **Manual Valve Position** lên khoảng `45°` hoặc `50°`.
   * **Quan sát:** Nhịp BPM sẽ tăng lên, bộ PID trên ESP32 sẽ tự động điều tiết góc van khép dần về mức cân bằng và ổn định nhịp tim xoay quanh `60 BPM` (màu xanh lá bình thường).

2. **Demo Sự cố Tắc nghẽn / Cạn túi dịch (Trigger Danger):**
   * Nhấn nút **Trigger Danger**.
   * **Quan sát:** Thể tích sụt ngay về `5.0 mL`, nhịp BPM lập tức tắt ngóm về `0.0 BPM`. Đèn LED đỏ trên mạch ESP32 nhấp nháy, còi Buzzer kêu liên tục cảnh báo và OLED hiển thị `[DANGER]`.
   * Giao diện Web hiển thị Banner đỏ chót: **"System Status: Danger"** cùng biểu đồ sụt thẳng đứng và đi ngang.

3. **Bác sĩ xử lý sự cố (Resolve Danger):**
   * Nhấn nút **Resolve Danger** hoặc kéo thanh trượt **Manual Valve Position** lên lại `45°`.
   * **Quan sát:** Còi trên ESP32 tắt ngay lập tức, trạng thái phục hồi về xanh lá (`normal`), thể tích bơm lại đầy `500 mL` và nhịp rơi tiếp tục tự động điều tiết bình thường.

4. **Khóa dịch thủ công:**
   * Kéo thanh trượt **Manual Valve Position** về sát mức `0°` (dưới `20°`).
   * **Quan sát:** Dịch dừng chảy (BPM = 0) nhưng hệ thống nhận diện đây là thao tác tắt chủ động của bác sĩ nên **không hề rú còi hay báo lỗi**, hiển thị trạng thái `normal` an toàn.
