import React, { useState } from 'react';
import axios from 'axios';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';

export default function BedCard({ bed, deviceData, onDischarge }) {
  const deviceId = bed.patient.device;

  // Quản lý mục tiêu (Target) cục bộ để phản ứng tức thì
  const [currentTarget, setCurrentTarget] = useState(parseFloat(bed.patient.target || 0));

  // Lấy dữ liệu Real-time
  const telemetry = deviceData?.telemetry || { bpm: 0, status: 'normal', target_bpm: 0, servo_angle: 0 };
  const displayTarget = telemetry.target_bpm || currentTarget;
  const currentStatus = telemetry.status;

  // Chuẩn bị dữ liệu Sparkline
  const rawHistory = deviceData?.history || [];
  const chartData = rawHistory.map(item => ({
    ...item,
    target: displayTarget 
  }));

  // LOGIC BIẾN HÌNH (Màu sắc, Icon, Nhấp nháy)
  let cardStatusClass = "card-normal";
  let aiMessage = "Đang đồng bộ...";
  let aiIcon = "🧠"; 
  let colorTheme = "#00c853"; 

  if (currentStatus === 'normal') {
    cardStatusClass = "card-normal";
    aiMessage = "BÌNH THƯỜNG (An toàn)";
    aiIcon = "🟢";
    colorTheme = "#00c853";
  } else if (currentStatus === 'danger') {
    cardStatusClass = "card-danger"; 
    aiMessage = "BÁO ĐỘNG: TẮC NGHẼN / HẾT DỊCH!";
    aiIcon = "🚨"; 
    colorTheme = "#ff5252";
  } else if (currentStatus === 'warning') {
    cardStatusClass = "card-warning"; 
    aiMessage = "CẢNH BÁO: CHẢY QUÁ NHANH!";
    aiIcon = "⚠️"; 
    colorTheme = "#ffb300";
  }

  const progressWidth = Math.min((telemetry.bpm / (displayTarget * 1.5 || 100)) * 100, 100);

  const [newTarget, setNewTarget] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleLiveUpdate = async () => {
    if (!newTarget || isNaN(newTarget)) return alert("Nhập số hợp lệ!");
    setIsUpdating(true);
    try {
      await axios.post(`http://localhost:8000/api/device/${deviceId}/target`, { 
        new_target: parseFloat(newTarget) 
      });
      setCurrentTarget(parseFloat(newTarget)); 
      setNewTarget("");
    } catch (error) {
      alert("Lỗi cập nhật phác đồ!");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`patient-card ${cardStatusClass}`} style={{ transition: 'all 0.4s ease' }}>
      <div className="card-header">
        <div className="bed-info">
          <span className="label">GIƯỜNG {bed.id}</span>
          <span className="value" style={{fontSize: '1.4rem'}}>{bed.patient.name}</span>
          <div style={{fontSize: '0.8rem', color: '#9094a6', marginTop: '5px'}}>Bắt đầu: {bed.patient.startTime}</div>
        </div>
        <div className="device-info">
          <span className="label">THIẾT BỊ</span>
          <span className="value">{deviceId}</span>
          <button className="btn-discharge" onClick={() => onDischarge(bed.id, deviceId)}>KẾT THÚC</button>
        </div>
      </div>

      <div className="main-display" style={{marginBottom: '15px'}}>
        <h2 className="current-rate" style={{ color: colorTheme, fontSize: '5rem', textShadow: `0 0 25px ${colorTheme}30`, transition: 'color 0.3s' }}>
          {telemetry.bpm?.toFixed(1) || "0.0"}
        </h2>
        <span className="unit">giọt/phút (bpm)</span>
        
        <div className="progress-container">
          <div className="progress-bg">
            <div className="progress-bar" style={{ width: `${progressWidth}%`, backgroundColor: colorTheme, transition: 'width 0.5s ease-in-out, background-color 0.3s' }}></div>
          </div>
          <div className="target-marker" style={{ left: `${Math.min((displayTarget / (displayTarget * 1.5 || 100)) * 100, 100)}%`, transition: 'left 0.5s ease' }}>
            <span className="marker-label">Mục tiêu: {displayTarget}</span>
          </div>
        </div>
      </div>

      <div className="ai-panel" style={{ marginBottom: '15px', background: `${colorTheme}15`, border: `1px solid ${colorTheme}40`, borderRadius: '12px', padding: '10px' }}>
        <div className="ai-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="ai-icon" style={{fontSize: '1.2rem'}}>{aiIcon}</span>
          <span className="ai-title" style={{color: colorTheme, fontWeight: 'bold', fontSize: '0.8rem'}}>AI CHẨN ĐOÁN</span>
        </div>
        <div className="ai-message" style={{fontSize: '0.9rem', fontWeight: 'bold', color: colorTheme, marginTop: '4px'}}>
          {aiMessage}
        </div>
      </div>

      <div className="chart-container" style={{marginBottom: '15px', padding: '0 5px'}}>
        <div style={{ width: '100%', height: 65 }}>
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <Tooltip contentStyle={{ backgroundColor: '#242731', border: 'none', borderRadius: '8px', fontSize: '11px' }} itemStyle={{ fontWeight: 'bold' }} />
              <Line type="monotone" dataKey="target" stroke="#9094a6" strokeWidth={1} dot={false} strokeDasharray="3 3" isAnimationActive={false} />
              <Line type="monotone" dataKey="current" stroke={colorTheme} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="live-control" style={{display: 'flex', gap: '8px', borderTop: '1px solid #2d3142', paddingTop: '15px'}}>
        <input type="number" placeholder="Tốc độ mới..." value={newTarget} onChange={(e) => setNewTarget(e.target.value)} style={{flex: 1, background: '#0f111a', border: '1px solid #2d3142', color: '#fff', padding: '8px 12px', borderRadius: '8px'}} />
        <button onClick={handleLiveUpdate} disabled={isUpdating} style={{ background: isUpdating ? '#2d3142' : '#4776ff', color: '#fff', border: 'none', padding: '0 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s' }}>
          {isUpdating ? "..." : "ĐỔI"}
        </button>
      </div>
    </div>
  );
}