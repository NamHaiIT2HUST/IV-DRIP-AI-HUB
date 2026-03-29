import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function BedCard({ bed, deviceData, onDischarge }) {
  const deviceId = bed.patient.device;
  const telemetry = deviceData?.telemetry || { 
    current: 0, target: bed.patient.target, angle: 0, ai_code: "WAIT", ai_message: "Đang đồng bộ..." 
  };
  const history = deviceData?.history || [];

  let aiColorClass = "ai-normal";
  if (telemetry.ai_code?.includes("WARNING")) aiColorClass = "ai-warning";
  if (telemetry.ai_code?.includes("DANGER")) aiColorClass = "ai-danger";
  if (telemetry.ai_code === "WAIT" || telemetry.ai_code === "ANALYZING") aiColorClass = "ai-analyzing";
  
  const isDanger = telemetry.ai_code?.includes("DANGER");
  const progressWidth = Math.min((telemetry.current / (telemetry.target * 1.5 || 100)) * 100, 100);

  return (
    <div className={`patient-card ${isDanger ? 'alert' : ''}`}>
      <div className="card-header">
        <div className="bed-info">
          <span className="label">GIƯỜNG {bed.id}</span>
          <span className="value" style={{fontSize: '1.4rem'}}>{bed.patient.name}</span>
          <div style={{fontSize: '0.8rem', color: '#9094a6', marginTop: '5px'}}>Bắt đầu lúc: {bed.patient.startTime}</div>
        </div>
        <div className="device-info">
          <span className="label">THIẾT BỊ</span>
          <span className="value">{deviceId}</span>
          <button className="btn-discharge" onClick={() => onDischarge(bed.id, deviceId)}>KẾT THÚC</button>
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
          <span className="ai-icon">🧠</span><span className="ai-title">AI CHẨN ĐOÁN</span>
        </div>
        <div className="ai-message" style={{fontSize: '0.85rem'}}>{telemetry.ai_message}</div>
      </div>

      <div className="chart-container" style={{marginBottom: '0', padding: '10px'}}>
        <div style={{ width: '100%', height: 100 }}>
          <ResponsiveContainer>
            <LineChart data={history} margin={{ top: 5, right: 0, left: -30, bottom: 0 }}>
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
}