import { useState, useEffect } from 'react';

const WEBSOCKET_URL = 'ws://localhost:8000/ws/telemetry';

export const useHospitalSocket = () => {
  const [telemetryData, setTelemetryData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = new WebSocket(WEBSOCKET_URL);

    socket.onopen = () => {
      console.log('✅ [React] Đã bắt sóng thành công trạm FastAPI!');
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('🔥 [React] Nhận data từ AI:', data);
        setTelemetryData(data); // Cập nhật state để React render lại UI
      } catch (error) {
        console.error('❌ [React] Lỗi đọc dữ liệu JSON:', error);
      }
    };

    socket.onclose = () => {
      console.log('🛑 [React] Bị mất sóng WebSocket.');
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error('⚠️ [React] Lỗi kết nối WebSocket:', error);
    };

    return () => {
      socket.close();
    };
  }, []); 

  return { telemetryData, isConnected };
};