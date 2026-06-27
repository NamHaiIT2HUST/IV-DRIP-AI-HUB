# TÀI LIỆU TRẠNG THÁI DỰ ÁN & HƯỚNG DẪN DEMO (IV-DRIP-AI-HUB)

**Mục đích của file này:**
File này được tạo ra để lưu lại toàn bộ tiến độ, các thay đổi phần cứng và phần mềm cực kỳ quan trọng mà team đã debug. Bất cứ khi nào bạn mở một phiên chat mới với Gemini hoặc các AI khác, hãy bảo AI đọc file này trước tiên để nắm rõ tình hình dự án.

---

## 1. CẤU HÌNH PHẦN CỨNG (ĐÃ FIX LỖI)

Dự án sử dụng vi điều khiển **ESP32-S3 DevKitC-1** (Không phải ESP32 WROOM-32 cũ). Điều này dẫn đến một số thay đổi chân cắm bắt buộc để tránh lỗi sập nguồn (Watchdog Reset) và đụng độ RAM (PSRAM).

**Sơ đồ chân hiện tại (Phải cắm đúng 100%):**
*   **OLED 0.96" (Chip SH1106):** 
    *   `SDA` = Chân 4
    *   `SCL` = Chân 7
    *   *Lưu ý:* Phải dùng thư viện U8g2 Software I2C. Không cắm vào chân 16, 17 vì sẽ bị nhiễu do chip PSRAM gây chớp tắt màn hình.
*   **Hệ thống Báo động (Alarm):**
    *   `Còi (Buzzer)` = Chân 6
    *   `LED Đỏ` = 10, `LED Vàng` = 11, `LED Xanh` = 12
    *   *Lưu ý:* Không dùng các chân 25, 26, 27, 33 vì ESP32-S3 không có các chân này, gọi lệnh sẽ gây lỗi `ledc_channel_config gpio_num argument is invalid` làm mạch bootloop liên tục.
*   **Động cơ Servo:** Chân 21
*   **Cảm biến Giọt (Drop Sensor):** Chân 5 (Dùng ngắt - Interrupt)
*   **Loadcell (HX711):** `DT` = 18, `SCK` = 19
*   **Nguồn điện:** Nên cấp nguồn cho OLED từ chân 3.3V của ESP32-S3. Nếu dùng nguồn 5V ngoài, bắt buộc phải nối chung GND.

---

## 2. CẤU TRÚC PHẦN MỀM & TÍNH NĂNG MỚI

Hệ thống bao gồm 3 thành phần chính:
1.  **Edge Device (ESP32-S3):** Viết bằng C++ trên PlatformIO. Chạy PID điều khiển góc Servo dựa trên BPM mục tiêu. Chạy Edge AI (Logic an toàn) để kích hoạt báo động nếu hết nước hoặc tắc nghẽn.
2.  **Backend (Python/FastAPI):** Lắng nghe dữ liệu MQTT từ ESP32, lưu trữ và cung cấp API.
3.  **Frontend (ReactJS/Vite):** Hiển thị Dashboard theo thời gian thực (Biểu đồ, Trạng thái, Volume, BPM).

**🌟 Tính năng Đột phá: WEB SIMULATOR (Hardware-in-the-Loop)**
*   Vì việc test bằng nước thật khó khăn, chúng ta đã thêm một bảng điều khiển Mô phỏng (SimulatorPanel.jsx) ngay trên Web.
*   Khi bật Simulator trên Web, nó gửi cờ `simulation_mode = true` xuống ESP32. ESP32 sẽ bỏ qua dữ liệu từ cảm biến vật lý (Loadcell, IR) và dùng số liệu ảo từ Web.
*   ESP32 vẫn tính toán PID và tự động xoay Động cơ Servo thật.
*   Web đọc góc xoay của Servo thật để trừ lùi thể tích nước ảo, tạo thành một vòng lặp khép kín cực kỳ ấn tượng để Demo cho giáo viên.

---

## 3. HƯỚNG DẪN CHẠY DEMO TỪ A TỚI Z

Thứ tự bật các hệ thống để Demo không bị lỗi:

**Bước 1: Bật Broker MQTT (Mosquitto)**
Mở Terminal của Windows và chạy lệnh khởi động Mosquitto (đã cấu hình cho phép WebSockets):
```bash
"C:\Program Files\mosquitto\mosquitto.exe" -c "D:\Project\IV-Drip-AI-Hub\infrastructure\mosquitto\mosquitto.conf" -v
```
*(Nếu ESP32 báo lỗi `Connection reset by peer`, hãy vào Windows Defender Firewall và tạm TẮT tường lửa để ESP32 gửi dữ liệu vào PC được).*

**Bước 2: Bật Backend (Python)**
Mở một Terminal mới, trỏ vào thư mục `backend`:
```bash
cd D:\Project\IV-Drip-AI-Hub\backend
# Chạy các lệnh khởi động backend
```

**Bước 3: Bật Frontend (Web React)**
Mở Terminal mới, trỏ vào thư mục `frontend`:
```bash
cd D:\Project\IV-Drip-AI-Hub\frontend
npm run dev
```
Mở trình duyệt truy cập vào `http://localhost:5173`.

**Bước 4: Cấp điện cho Mạch ESP32-S3**
Cắm cáp USB. Đợi 5 giây để mạch kết nối WiFi.
Khi mạch hiện "System Ready!" trên OLED, bảng Dashboard trên Web sẽ bắt đầu nhảy số liệu thực tế.

**Bước 5: Thao tác Demo**
*   **Demo Thực tế:** Đè tay lên Loadcell để tăng Volume, quẹt tay qua khe cảm biến giọt để tạo BPM. Xem Servo tự quay bù trừ. Dừng quẹt tay đột ngột để test Còi báo động.
*   **Demo Simulator:** Lên Web, nhập `Initial Volume` = 500, bấm `Start Simulation`. Đứng nhìn hệ thống tự động truyền dịch và đồ thị tự vẽ trên Web.
