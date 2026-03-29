import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [telemetry, setTelemetry] = useState({
    device: "Đang kết nối...",
    current: 0.0,
    target: 0.0
  });

  useEffect(() => {
    // Khởi tạo kết nối WebSocket tới FastAPI
    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTelemetry(data);
    };

    ws.onerror = (error) => {
      console.log("WebSocket Lỗi: ", error);
    };

    // Cleanup function: Tự động đóng kết nối khi tắt trình duyệt/đổi trang
    return () => {
      ws.close();
    };
  }, []); // Cặp ngoặc vuông rỗng đảm bảo chỉ chạy 1 lần khi load trang

  // Logic cảnh báo
  const isDanger = Math.abs(telemetry.current - telemetry.target) > 2.0;

  return (
    <div className="dashboard-container">
      <h2>🏥 IV Drip - Hệ thống Giám sát Khoa ICU</h2>
      
      <div className="monitor-card">
        <div className="card-header">
          <span>Thiết bị: {telemetry.device}</span>
          <span className="status-dot">🟢 Đang hoạt động</span>
        </div>
        
        <div className="rate-display">
          <h1 style={{ color: isDanger ? '#ff4d4f' : '#52c41a' }}>
            {telemetry.current} <span className="unit">bpm</span>
          </h1>
          <p className="target-text">Mục tiêu: {telemetry.target} bpm</p>
        </div>

        {isDanger && (
          <div className="alert-box">
            ⚠️ CẢNH BÁO: Tốc độ truyền lệch khỏi phác đồ!
          </div>
        )}
      </div>
    </div>
  )
}

export default App