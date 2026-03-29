import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [telemetry, setTelemetry] = useState({
    device: "ESP_01",
    current: 44.9, // Dữ liệu từ ảnh của bạn
    target: 45.0,
    angle: 98.0
  });
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Kết nối tới WebSocket của FastAPI
    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");
    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (e) => setTelemetry(JSON.parse(e.data));
    ws.onclose = () => setIsConnected(false);
    return () => ws.close();
  }, []);

  const deviation = Math.abs(telemetry.current - telemetry.target);
  // Ngưỡng cảnh báo trong y tế thường rất khắt khe (ví dụ lệch >1.5 giọt)
  const isDanger = deviation > 1.5; 
  // Tính % progress (giả sử thang đo max 100 giọt/phút)
  const progressWidth = Math.min((telemetry.current / 100) * 100, 100);

  return (
    <div className="medical-app dark-theme">
      <header className="main-header">
        <div className="brand">
          <span className="icon-drop">💧</span>
          <h1>IV DRIP <span className="light">MONITOR</span></h1>
        </div>
        <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="pulse-dot"></span>
          {isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
        </div>
      </header>

      <main className="content">
        {/* Thẻ theo dõi bệnh nhân với hiệu ứng Danger Glow nếu có lỗi */}
        <div className={`patient-card ${isDanger ? 'alert danger-glow' : ''}`}>
          <div className="card-header">
            <div className="bed-info">
              <span className="label">GIƯỜNG</span>
              <span className="value">01</span>
            </div>
            <div className="device-info">
              <span className="label">THIẾT BỊ VẬT LÝ</span>
              <span className="value">{telemetry.device}</span>
            </div>
          </div>

          <div className="main-display">
            <div className="rate-container">
              {/* Con số chính: Xanh neon nếu OK, Đỏ neon nếu lỗi. Cực kỳ nổi bật trên nền đen */}
              <h2 className="current-rate" style={{ color: isDanger ? '#ff4d4f' : '#00e676' }}>
                {telemetry.current.toFixed(1)}
              </h2>
              <span className="unit">giọt/phút (bpm)</span>
            </div>
            
            <div className="progress-container">
              <div className="progress-bg">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progressWidth}%`, backgroundColor: isDanger ? '#ff4d4f' : '#00e676' }}
                ></div>
              </div>
              {/* Vạch đánh dấu mục tiêu */}
              <div className="target-marker" style={{ left: `${telemetry.target}%` }}>
                <span className="marker-label">Mục tiêu: {telemetry.target.toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">Phác đồ mục tiêu</span>
              <span className="stat-value">{telemetry.target.toFixed(1)} <small>bpm</small></span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Góc mở van cơ (Servo)</span>
              <span className="stat-value">{telemetry.angle.toFixed(1)}°</span>
            </div>
          </div>

          {isDanger && (
            <div className="danger-footer">
              ⚠️ CẢNH BÁO CAO: Tốc độ sai lệch vượt ngưỡng an toàn!
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;