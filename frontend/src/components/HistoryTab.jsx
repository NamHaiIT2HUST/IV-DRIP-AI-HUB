import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function HistoryTab() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hàm lấy dữ liệu từ Backend
  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Thêm timestamp ?t=... để tránh trình duyệt lấy dữ liệu cũ trong cache
      const response = await axios.get(`http://localhost:8000/api/patients/history?t=${Date.now()}`);
      setHistory(response.data);
    } catch (error) {
      console.error("Lỗi tải lịch sử", error);
    } finally {
      setLoading(false);
    }
  };

  // 🛠️ Tự động chạy lại mỗi khi Component được hiển thị
  useEffect(() => {
    fetchHistory();
  }, []);

  // Hàm chuyển đổi thời gian ISO sang giờ Việt Nam dễ đọc
  const formatTime = (isoString) => {
    if (!isoString) return "Chưa kết thúc";
    const date = new Date(isoString);
    return date.toLocaleString('vi-VN', { 
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' 
    });
  };

  return (
    <div style={{ background: '#1a1d29', borderRadius: '24px', padding: '30px', border: '1px solid #2d3142' }}>
      <h2 style={{ color: '#fff', marginTop: 0, borderBottom: '1px solid #2d3142', paddingBottom: '15px' }}>
        <span style={{marginRight: '10px'}}>🕒</span> LỊCH SỬ TRUYỀN DỊCH
      </h2>

      {loading ? (
        <p style={{ color: '#9094a6', textAlign: 'center' }}>Đang tải dữ liệu...</p>
      ) : history.length === 0 ? (
        <p style={{ color: '#9094a6', textAlign: 'center', fontStyle: 'italic' }}>Chưa có ca truyền nào được lưu trữ.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ color: '#9094a6', textTransform: 'uppercase', fontSize: '0.8rem' }}>
                <th style={{ padding: '15px', borderBottom: '1px solid #2d3142' }}>Mã Ca</th>
                <th style={{ padding: '15px', borderBottom: '1px solid #2d3142' }}>Bệnh nhân</th>
                <th style={{ padding: '15px', borderBottom: '1px solid #2d3142' }}>Thời gian Bắt đầu</th>
                <th style={{ padding: '15px', borderBottom: '1px solid #2d3142' }}>Thời gian Kết thúc</th>
                <th style={{ padding: '15px', borderBottom: '1px solid #2d3142' }}>Phác đồ chỉ định</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id} style={{ borderBottom: '1px solid rgba(45, 49, 66, 0.4)' }}>
                  <td style={{ padding: '15px', color: '#9094a6' }}>#{record.id}</td>
                  <td style={{ padding: '15px', color: '#fff', fontWeight: 'bold' }}>{record.full_name}</td>
                  <td style={{ padding: '15px', color: '#e0e0e0' }}>{formatTime(record.created_at)}</td>
                  <td style={{ padding: '15px', color: '#ff5252' }}>{formatTime(record.end_time)}</td>
                  <td style={{ padding: '15px', color: '#ffb300' }}>{record.target_rate} bpm</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}