import React from 'react';

// Nhận thêm props usedDevices từ App.jsx
export default function AdmitModal({ 
  show, onClose, onSubmit, formData, setFormData, selectedBed, room, isUpdating, usedDevices 
}) {
  if (!show) return null;

  // Danh sách toàn bộ thiết bị bệnh viện có
  const ALL_DEVICES = ["ESP_01", "ESP_02", "ESP_03", "ESP_04"];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2 style={{marginTop: 0, color: '#fff'}}>NHẬP VIỆN - {room} - GIƯỜNG {selectedBed}</h2>
        
        <div className="form-group">
          <label>Tên bệnh nhân</label>
          <input 
            type="text" 
            placeholder="VD: Nguyễn Văn A..." 
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})} 
          />
        </div>
        
        {/* 🐛 THAY ĐỔI: Chuyển ô Input thành Dropdown Chọn Thiết Bị */}
        <div className="form-group">
          <label>Mã thiết bị (Chỉ hiển thị máy đang trống)</label>
          <select 
            value={formData.device} 
            onChange={e => setFormData({...formData, device: e.target.value})}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '12px 15px',
              background: '#0f111a', border: '1px solid #2d3142', color: '#fff',
              borderRadius: '8px', fontSize: '1rem', outline: 'none', cursor: 'pointer'
            }}
          >
            <option value="" disabled>-- Chọn thiết bị truyền dịch --</option>
            {ALL_DEVICES.map(dev => {
              const isUsed = usedDevices.includes(dev);
              return (
                <option key={dev} value={dev} disabled={isUsed} style={{color: isUsed ? '#9094a6' : '#00c853'}}>
                  {dev} {isUsed ? "(ĐANG BẬN)" : "(SẴN SÀNG)"}
                </option>
              );
            })}
          </select>
        </div>
        
        <div className="form-group">
          <label>Tốc độ chỉ định (bpm)</label>
          <input 
            type="number" 
            placeholder="45.0" 
            value={formData.target} 
            onChange={e => setFormData({...formData, target: e.target.value})} 
          />
        </div>
        
        <div className="btn-group" style={{marginTop: '25px'}}>
          <button className="btn-secondary" onClick={onClose}>HỦY BỎ</button>
          <button className="btn-primary" onClick={onSubmit} disabled={isUpdating}>
            {isUpdating ? "ĐANG XỬ LÝ..." : "LƯU & BẮT ĐẦU TRUYỀN"}
          </button>
        </div>
      </div>
    </div>
  );
}