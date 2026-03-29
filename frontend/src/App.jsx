import { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

function App() {
  const [telemetry, setTelemetry] = useState({ 
    device: "Đang dò...", current: 0.0, target: 0.0, angle: 0.0, bed: "--", name: "--",
    ai_code: "WAIT", ai_message: "Đang đồng bộ dữ liệu AI..."
  });
  const [historyData, setHistoryData] = useState([]); 
  const [isConnected, setIsConnected] = useState(false);
  
  // State mới cho ô nhập liệu của bác sĩ
  const [inputTarget, setInputTarget] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get("http://localhost:8000/api/telemetry/ESP_01?minutes=5");
        if (res.data && res.data.history) {
          setHistoryData(res.data.history);
        }
      } catch (error) {
        console.error("Lỗi lấy lịch sử:", error);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");
    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTelemetry(data);
      
      const now = new Date();
      const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                         now.getMinutes().toString().padStart(2, '0') + ':' + 
                         now.getSeconds().toString().padStart(2, '0');
                         
      setHistoryData(prev => {
        const newData = [...prev, { time: timeString, current: data.current, target: data.target }];
        return newData.length > 30 ? newData.slice(newData.length - 30) : newData;
      });
    };
    ws.onclose = () => setIsConnected(false);
    return () => ws.close();
  }, []);

  // --- HÀM BẮN LỆNH XUỐNG THIẾT BỊ ---
  const handleUpdateTarget = async () => {
    if (!inputTarget || isNaN(inputTarget)) return alert("Vui lòng nhập một số hợp lệ!");
    
    setIsUpdating(true);
    try {
      // Gọi API mà chúng ta vừa tạo ở Backend
      await axios.post(`http://localhost:8000/api/device/ESP_01/target`, {
        new_target: parseFloat(inputTarget)
      });
      setInputTarget(""); // Xóa ô input sau khi gửi thành công
    } catch (error) {
      console.error("Lỗi cập nhật phác đồ:", error);
      alert("Lỗi khi gửi lệnh xuống thiết bị!");
    } finally {
      setIsUpdating(false);
    }
  };

  let aiColorClass = "ai-normal";
  if (telemetry.ai_code.includes("WARNING")) aiColorClass = "ai-warning";
  if (telemetry.ai_code.includes("DANGER")) aiColorClass = "ai-danger";
  if (telemetry.ai_code === "WAIT" || telemetry.ai_code === "ANALYZING") aiColorClass = "ai-analyzing";

  const isDanger = telemetry.ai_code.includes("DANGER");
  const progressWidth = Math.min((telemetry.current / 100) * 100, 100);

  return (
    <div className="medical-app">
      <header className="main-header">
        <div className="brand">
          <span className="icon-drop">💧</span>
          <h1>IV DRIP <span className="light">AI HUB</span></h1>
        </div>
        <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="pulse-dot"></span>
          {isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
        </div>
      </header>

      <main className="content">
        <div className={`patient-card ${isDanger ? 'alert' : ''}`}>
          
          <div className="card-header">
            <div className="bed-info">
              <span className="label">GIƯỜNG {telemetry.bed}</span>
              <span className="value">{telemetry.name}</span>
            </div>
            <div className="device-info">
              <span className="label">THIẾT BỊ VẬT LÝ</span>
              <span className="value">{telemetry.device}</span>
            </div>
          </div>

          <div className="main-display">
            <h2 className="current-rate" style={{ color: isDanger ? '#ff5252' : '#00c853' }}>
              {telemetry.current.toFixed(1)}
            </h2>
            <span className="unit">giọt/phút (bpm)</span>
            
            <div className="progress-container">
              <div className="progress-bg">
                <div className="progress-bar" style={{ width: `${progressWidth}%`, backgroundColor: isDanger ? '#ff5252' : '#00c853' }}></div>
              </div>
              <div className="target-marker" style={{ left: `${telemetry.target}%` }}>
                <span className="marker-label">Mục tiêu: {telemetry.target.toFixed(1)}</span>
              </div>
            </div>
          </div>

          {/* --- KHU VỰC ĐIỀU KHIỂN XUỐNG (DOWNLINK CONTROL) --- */}
          <div className="control-panel">
            <input 
              type="number" 
              className="target-input" 
              placeholder="Nhập tốc độ mới..." 
              value={inputTarget}
              onChange={(e) => setInputTarget(e.target.value)}
            />
            <button 
              className="btn-update" 
              onClick={handleUpdateTarget}
              disabled={!isConnected || isUpdating}
            >
              {isUpdating ? "ĐANG GỬI..." : "CẬP NHẬT LỆNH"}
            </button>
          </div>
          {/* ------------------------------------------------ */}

          <div className={`ai-panel ${aiColorClass}`}>
            <div className="ai-header">
              <span className="ai-icon">🧠</span>
              <span className="ai-title">AI CHẨN ĐOÁN THỜI GIAN THỰC</span>
              <span className="ai-code">[{telemetry.ai_code}]</span>
            </div>
            <div className="ai-message">
              {telemetry.ai_message}
            </div>
          </div>

          <div className="chart-container">
            <span className="label" style={{marginBottom: '15px', textAlign: 'center'}}>BIỂU ĐỒ LƯU LƯỢNG LỊCH SỬ</span>
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer>
                <LineChart data={historyData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#323645" vertical={false} />
                  <XAxis dataKey="time" stroke="#9094a6" fontSize={10} tickMargin={10} />
                  <YAxis stroke="#9094a6" fontSize={10} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip contentStyle={{ backgroundColor: '#242731', border: '1px solid #323645', borderRadius: '8px' }} itemStyle={{ color: '#00c853', fontWeight: 'bold' }} />
                  <Line type="monotone" dataKey="target" stroke="#ffb300" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="current" stroke={isDanger ? "#ff5252" : "#00c853"} strokeWidth={3} dot={false} animationDuration={300} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <span className="stat-label">Phác đồ mục tiêu</span>
              <span className="stat-value">{telemetry.target.toFixed(1)} <small>bpm</small></span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Góc mở van cơ</span>
              <span className="stat-value">{telemetry.angle.toFixed(1)}°</span>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default App;