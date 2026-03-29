import React from 'react';

export default function AdmitModal({ 
  show, 
  onClose, 
  onSubmit, 
  formData, 
  setFormData, 
  selectedBed, 
  room, 
  isUpdating 
}) {
  if (!show) return null;

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
        
        <div className="form-group">
          <label>Mã thiết bị kết nối</label>
          <input 
            type="text" 
            placeholder="VD: ESP_01" 
            value={formData.device} 
            onChange={e => setFormData({...formData, device: e.target.value})} 
          />
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