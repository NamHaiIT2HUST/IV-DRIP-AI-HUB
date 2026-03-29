import numpy as np

class DripAIEngine:
    def __init__(self, window_size=10):
        #Lưu 10 giá trị gần nhất để phân tích xu hướng
        self.history = []
        self.window_size = window_size

    def analyze(self, current_rate, target_rate, valve_angle):
        self.history.append(current_rate)
        
        # Nhớ 10 giây gần nhất
        if len(self.history) > self.window_size:
            self.history.pop(0)

        if len(self.history) < self.window_size:
            return "ANALYZING", "Hệ thống đang thu thập mẫu AI..."

        mean_rate = np.mean(self.history)
        std_dev = np.std(self.history) # Độ lệch chuẩn
          
        # 1. Van đã mở hết cỡ nhưng nước không chảy -> TẮC ỐNG / HẾT DỊCH
        if mean_rate < (target_rate - 3.0) and valve_angle > 85.0:
            return "DANGER_OCCLUSION", "CẢNH BÁO TẮC NGHẼN: Van mở cực đại nhưng lưu lượng thấp!"
            
        # 2. Dữ liệu dao động quá mạnh -> BỆNH NHÂN CỬ ĐỘNG
        elif std_dev > 3.0:
            return "WARNING_MOVEMENT", "NHIỄU ĐỘNG: Bệnh nhân cử động hoặc cảm biến rung lắc."
            
        # 3. Chảy nhanh hơn phác đồ liên tục -> LỖI CHẢY TỰ DO
        elif mean_rate > (target_rate + 2.0):
            return "DANGER_OVERFLOW", "CẢNH BÁO TRÀN DỊCH: Tốc độ đang vượt phác đồ!"
            
        # 4. Mọi thứ trong tầm kiểm soát
        else:
            return "NORMAL", "Nhịp truyền ổn định, đáp ứng tốt phác đồ."

# Khởi tạo một phiên bản AI (Singleton) để dùng chung
ai_analyzer = DripAIEngine()