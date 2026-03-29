import { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './App.css';

function App() {
  // 1. STATE QUẢN LÝ DANH SÁCH GIƯỜNG (Mặc định 4 giường trống)
  const [beds, setBeds] = useState([
    { id: "01", patient: null },
    { id: "02", patient: null },
    { id: "03", patient: null },
    { id: "04", patient: null },
  ]);

  // 2. STATE QUẢN LÝ DỮ LIỆU TỪNG THIẾT BỊ
  // Cấu trúc: { "ESP_01": { telemetry: {...}, history: [...] }, "ESP_02": {...} }
  const [devicesData, setDevicesData] = useState({});
  const [isConnected, setIsConnected] = useState(false);

  // 3. STATE CHO MODAL NHẬP VIỆN
  const [showModal, setShowModal] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [formData, setFormData] = useState({ name: "", device: "ESP_01", target: "45.0" });
  const [isUpdating, setIsUpdating] = useState(false);

  // --- KẾT NỐI WEBSOCKET LẮNG NGHE TẤT CẢ THIẾT BỊ ---
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");
    ws.onopen = () => setIsConnected(true);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const deviceId = data.device;
      
      const now = new Date();
      const timeString = now.getHours().toString().padStart(2, '0') + ':' + 
                         now.getMinutes().toString().padStart(2, '0') + ':' + 
                         now.getSeconds().toString().padStart(2, '0');

      // Cập nhật dữ liệu động cho đúng thiết bị đang gửi lên
      setDevicesData(prev => {
        const prevDevice = prev[deviceId] || { telemetry: {}, history: [] };
        const newHistory = [...prevDevice.history, { time: timeString, current: data.current, target: data.target }];
        
        return {
          ...prev,
          [deviceId]: {
            telemetry: data,
            history: newHistory.length > 30 ? newHistory.slice(newHistory.length - 30) : newHistory
          }
        };
      });
    };
    
    ws.onclose = () => setIsConnected(false);
    return () => ws.close();
  }, []);

  // --- HÀM 1: BÁC SĨ TẠO HỒ SƠ & BẮT ĐẦU TRUYỀN ---
  const handleCreatePatient = async () => {
    if (!formData.name || !formData.device || !formData.target) {
      return alert("Vui lòng điền đầy đủ thông tin!");
    }
    
    setIsUpdating(true);
    try {
      // Bắn lệnh xuống ESP32 thông qua Backend
      await axios.post(`http://localhost:8000/api/device/${formData.device}/target`, {
        new_target: parseFloat(formData.target)
      });

      // Ghi nhận giờ bắt đầu và cập nhật trạng thái giường
      const startTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      
      setBeds(beds.map(b => b.id === selectedBed ? { 
        ...b, 
        patient: { ...formData, startTime: startTime } 
      } : b));

      // Đóng Modal và Reset Form
      setShowModal(false);
      setFormData({ name: "", device: "", target: "" });
    } catch (error) {
      console.error("Lỗi khởi tạo:", error);
      alert("Lỗi khi gửi lệnh xuống thiết bị! Hãy kiểm tra Backend.");
    } finally {
      setIsUpdating(false);
    }
  };

  // --- HÀM 2: KẾT THÚC TRUYỀN (XẢ GIƯỜNG) ---
  const handleDischarge = async (bedId, deviceId) => {
    if(!window.confirm(`Xác nhận rút kim và giải phóng Giường ${bedId}?`)) return;
    
    try {
      // Gửi lệnh target = 0 để khóa van thiết bị lại
      await axios.post(`http://localhost:8000/api/device/${deviceId}/target`, { new_target: 0.0 });
      // Xóa thông tin bệnh nhân khỏi giường
      setBeds(beds.map(b => b.id === bedId ? { ...b, patient: null } : b));
    } catch (error) {
      alert("Lỗi khi ngắt thiết bị!");
    }
  };

  // --- COMPONENT CON: RENDER GIƯỜNG ĐANG HOẠT ĐỘNG ---
  const renderActiveBed = (bed) => {
    const deviceId = bed.patient.device;
    // Lấy data của thiết bị này, nếu chưa có thì dùng data mặc định
    const deviceData = devicesData[deviceId] || { 
      telemetry: { current: 0, target: bed.patient.target, angle: 0, ai_code: "WAIT", ai_message: "Đang đồng bộ..." }, 
      history: [] 
    };
    const telemetry = deviceData.telemetry;

    // Logic tính toán màu sắc AI cho riêng giường này
    let aiColorClass = "ai-normal";
    if (telemetry.ai_code?.includes("WARNING")) aiColorClass = "ai-warning";
    if (telemetry.ai_code?.includes("DANGER")) aiColorClass = "ai-danger";
    if (telemetry.ai_code === "WAIT" || telemetry.ai_code === "ANALYZING") aiColorClass = "ai-analyzing";
    
    const isDanger = telemetry.ai_code?.includes("DANGER");
    const progressWidth = Math.min((telemetry.current / (telemetry.target * 1.5 || 100)) * 100, 100);

    return (
      <div className={`patient-card ${isDanger ? 'alert' : ''}`} key={bed.id}>
        <div className="card-header">
          <div className="bed-info">
            <span className="label">GIƯỜNG {bed.id}</span>
            <span className="value" style={{fontSize: '1.4rem'}}>{bed.patient.name}</span>
            <div style={{fontSize: '0.8rem', color: '#9094a6', marginTop: '5px'}}>Bắt đầu lúc: {bed.patient.startTime}</div>
          </div>
          <div className="device-info">
            <span className="label">THIẾT BỊ</span>
            <span className="value">{deviceId}</span>
            <button className="btn-discharge" onClick={() => handleDischarge(bed.id, deviceId)}>KẾT THÚC</button>
          </div>
        </div>

        <div className="main-display" style={{marginBottom: '20px'}}>
          <h2 className="current-rate" style={{ color: isDanger ? '#ff5252' : '#00c853', fontSize: '5rem' }}>
            {telemetry.current?.toFixed(1) || "0.0"}
          </h2>
          <span className="unit">giọt/phút (bpm)</span>
          
          <div className="progress-container">
            <div className="progress-bg">
              <div className="progress-bar" style={{ width: `${progressWidth}%`, backgroundColor: isDanger ? '#ff5252' : '#00c853' }}></div>
            </div>
            <div className="target-marker" style={{ left: `${Math.min((telemetry.target / (telemetry.target * 1.5 || 100)) * 100, 100)}%` }}>
              <span className="marker-label">Mục tiêu: {telemetry.target}</span>
            </div>
          </div>
        </div>

        <div className={`ai-panel ${aiColorClass}`} style={{marginBottom: '15px'}}>
          <div className="ai-header">
            <span className="ai-icon">🧠</span>
            <span className="ai-title">AI CHẨN ĐOÁN</span>
          </div>
          <div className="ai-message" style={{fontSize: '0.85rem'}}>
            {telemetry.ai_message}
          </div>
        </div>

        <div className="chart-container" style={{marginBottom: '0', padding: '10px'}}>
          <div style={{ width: '100%', height: 100 }}>
            <ResponsiveContainer>
              <LineChart data={deviceData.history} margin={{ top: 5, right: 0, left: -30, bottom: 0 }}>
                <YAxis stroke="#9094a6" fontSize={9} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip contentStyle={{ backgroundColor: '#242731', border: '1px solid #323645', borderRadius: '8px' }} itemStyle={{ color: '#00c853', fontWeight: 'bold' }} />
                <Line type="monotone" dataKey="target" stroke="#ffb300" strokeWidth={1} dot={false} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="current" stroke={isDanger ? "#ff5252" : "#00c853"} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="medical-app">
      <header className="main-header">
        <div className="brand">
          <span className="icon-drop">🏥</span>
          <h1>CMS <span className="light">CENTRAL MONITORING</span></h1>
        </div>
        <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="pulse-dot"></span>
          {isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
        </div>
      </header>

      <main className="content">
        {/* LƯỚI GRID HIỂN THỊ TẤT CẢ CÁC GIƯỜNG */}
        <div className="beds-grid">
          {beds.map(bed => (
            bed.patient ? renderActiveBed(bed) : (
              // COMPONENT CON: RENDER GIƯỜNG TRỐNG
              <div className="bed-card-empty" key={bed.id} onClick={() => { setSelectedBed(bed.id); setShowModal(true); }}>
                <div className="empty-icon">+</div>
                <h3>GIƯỜNG {bed.id}</h3>
                <p>Nhấn để thêm bệnh nhân</p>
              </div>
            )
          ))}
        </div>
      </main>

      {/* OVERLAY MODAL FORM NHẬP VIỆN */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{marginTop: 0, color: '#fff'}}>NHẬP VIỆN - GIƯỜNG {selectedBed}</h2>
            
            <div className="form-group">
              <label>Tên bệnh nhân</label>
              <input type="text" placeholder="VD: Nguyễn Văn A..." value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
            </div>
            
            <div className="form-group">
              <label>Mã thiết bị kết nối</label>
              <input type="text" placeholder="VD: ESP_01" value={formData.device} onChange={e => setFormData({...formData, device: e.target.value})} />
            </div>
            
            <div className="form-group">
              <label>Tốc độ chỉ định (bpm)</label>
              <input type="number" placeholder="45.0" value={formData.target} onChange={e => setFormData({...formData, target: e.target.value})} />
            </div>
            
            <div className="btn-group" style={{marginTop: '25px'}}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>HỦY BỎ</button>
              <button className="btn-primary" onClick={handleCreatePatient} disabled={isUpdating}>
                {isUpdating ? "ĐANG XỬ LÝ..." : "LƯU & BẮT ĐẦU TRUYỀN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;