import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import BedCard from './components/BedCard';
import AdmitModal from './components/AdmitModal';

function App() {
  const [location, setLocation] = useState({ building: null, floor: null, room: null });
  
  const hospitalData = {
    "Tòa A (Nội khoa)": ["Tầng 1", "Tầng 2", "Tầng 3"],
    "Tòa B (Hồi sức cấp cứu)": ["Tầng 1 (ICU)", "Tầng 2"],
    "Tòa C (Nhi khoa)": ["Tầng 1", "Tầng 2"]
  };
  const roomsData = ["Phòng 101", "Phòng 102", "Phòng 103", "Phòng 104"];

  // 1. LƯU TRỮ DỮ LIỆU THEO DẠNG "CUỐN SỔ" (Mỗi phòng là 1 trang riêng biệt)
  const [roomBeds, setRoomBeds] = useState(() => {
    const savedRooms = localStorage.getItem('iv_drip_rooms');
    return savedRooms ? JSON.parse(savedRooms) : {};
  });

  // Tự động lưu vào LocalStorage mỗi khi có thay đổi để F5 không mất dữ liệu
  useEffect(() => {
    localStorage.setItem('iv_drip_rooms', JSON.stringify(roomBeds));
  }, [roomBeds]);

  // 2. TẠO CHÌA KHÓA ĐỊNH DANH PHÒNG ĐANG ĐỨNG (VD: "Tòa A (Nội khoa)-Tầng 1-Phòng 101")
  const currentRoomKey = `${location.building}-${location.floor}-${location.room}`;

  // Lấy 4 giường của phòng hiện tại. Nếu phòng chưa có ai thì cấp 4 giường trống
  const currentBeds = roomBeds[currentRoomKey] || [
    { id: "01", patient: null }, { id: "02", patient: null },
    { id: "03", patient: null }, { id: "04", patient: null },
  ];

  // STATE HỆ THỐNG & MODAL
  const [devicesData, setDevicesData] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [formData, setFormData] = useState({ name: "", device: "ESP_01", target: "45.0" });
  const [isUpdating, setIsUpdating] = useState(false);

  // WEBSOCKET: NHẬN DỮ LIỆU TỪ CẢM BIẾN
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");
    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const deviceId = data.device;
      const timeString = new Date().toLocaleTimeString('vi-VN', { hour12: false });
      
      setDevicesData(prev => {
        const prevDevice = prev[deviceId] || { telemetry: {}, history: [] };
        const newHistory = [...prevDevice.history, { time: timeString, current: data.current, target: data.target }];
        return { ...prev, [deviceId]: { telemetry: data, history: newHistory.length > 30 ? newHistory.slice(-30) : newHistory } };
      });
    };
    ws.onclose = () => setIsConnected(false);
    return () => ws.close();
  }, []);

  // HÀM 1: NHẬP VIỆN
  const handleCreatePatient = async () => {
    if (!formData.name || !formData.device || !formData.target) return alert("Vui lòng điền đủ thông tin!");
    setIsUpdating(true);
    try {
      // Bắn lệnh tạo bệnh nhân xuống Backend với mã giường duy nhất
      await axios.post(`http://localhost:8000/api/patients/admit`, {
        name: formData.name, 
        device_id: formData.device, 
        target: parseFloat(formData.target), 
        bed: `${currentRoomKey}-${selectedBed}` // Gửi chính xác địa chỉ: Tòa-Tầng-Phòng-Giường
      });
      
      const startTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      
      // Cập nhật thông tin bệnh nhân vào đúng giường của phòng hiện tại
      const updatedBeds = currentBeds.map(b => b.id === selectedBed ? { ...b, patient: { ...formData, startTime } } : b);
      
      // Lưu lại vào Cuốn sổ tổng
      setRoomBeds(prev => ({ ...prev, [currentRoomKey]: updatedBeds }));
      
      setShowModal(false); 
      setFormData({ name: "", device: "ESP_01", target: "45.0" });
    } catch (error) { 
      alert("Lỗi gửi lệnh! Hãy kiểm tra Backend."); 
      console.error(error);
    } finally { 
      setIsUpdating(false); 
    }
  };

  // HÀM 2: KẾT THÚC TRUYỀN DỊCH
  const handleDischarge = async (bedId, deviceId) => {
    if(!window.confirm(`Xác nhận giải phóng Giường ${bedId}?`)) return;
    try {
      // Gửi lệnh tắt máy xuống Backend
      await axios.post(`http://localhost:8000/api/device/${deviceId}/target`, { new_target: 0.0 });
      
      // Xóa bệnh nhân khỏi giường của phòng hiện tại
      const updatedBeds = currentBeds.map(b => b.id === bedId ? { ...b, patient: null } : b);
      setRoomBeds(prev => ({ ...prev, [currentRoomKey]: updatedBeds }));
    } catch (error) { 
      alert("Lỗi ngắt thiết bị!"); 
    }
  };

  // HÀM 3: NÚT QUAY LẠI (BACK)
  const goBack = () => {
    if (location.room) setLocation({ ...location, room: null });
    else if (location.floor) setLocation({ ...location, floor: null });
    else if (location.building) setLocation({ ...location, building: null });
  };

  return (
    <div className="medical-app">
      <header className="main-header">
        <div className="brand">
          <span className="icon-drop">🏥</span><h1>IV DRIP <span className="light">HOSPITAL CMS</span></h1>
        </div>
        <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="pulse-dot"></span>{isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
        </div>
      </header>

      {/* --- THANH ĐIỀU HƯỚNG BREADCRUMB --- */}
      <div className="breadcrumb" style={{display: 'flex', justifyContent: 'space-between'}}>
        <div>
          <span className="crumb" onClick={() => setLocation({ building: null, floor: null, room: null })}>Tổng quan</span>
          {location.building && <><span className="separator">/</span><span className="crumb" onClick={() => setLocation({ ...location, floor: null, room: null })}>{location.building}</span></>}
          {location.floor && <><span className="separator">/</span><span className="crumb" onClick={() => setLocation({ ...location, room: null })}>{location.floor}</span></>}
          {location.room && <><span className="separator">/</span><span className="crumb active">{location.room}</span></>}
        </div>
        
        {/* Nút Back chỉ hiện khi đang ở trong các Tòa/Tầng/Phòng */}
        {location.building && (
          <button 
            onClick={goBack}
            style={{background: 'transparent', border: '1px solid #4776ff', color: '#4776ff', padding: '4px 12px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'}}
          >
            ⬅ QUAY LẠI
          </button>
        )}
      </div>

      <main className="content">
        {/* MÀN HÌNH 1: CHỌN TÒA NHÀ */}
        {!location.building && (
          <div className="nav-grid">
            {Object.keys(hospitalData).map(bldg => (
              <div className="nav-card" key={bldg} onClick={() => setLocation({ ...location, building: bldg })}>
                <div className="nav-icon">🏢</div><h3>{bldg}</h3><p>{hospitalData[bldg].length} Tầng hoạt động</p>
              </div>
            ))}
          </div>
        )}

        {/* MÀN HÌNH 2: CHỌN TẦNG */}
        {location.building && !location.floor && (
          <div className="nav-grid">
            {hospitalData[location.building].map(flr => (
              <div className="nav-card" key={flr} onClick={() => setLocation({ ...location, floor: flr })}>
                <div className="nav-icon">🚥</div><h3>{flr}</h3><p>4 Phòng điều trị</p>
              </div>
            ))}
          </div>
        )}

        {/* MÀN HÌNH 3: CHỌN PHÒNG */}
        {location.building && location.floor && !location.room && (
          <div className="nav-grid">
            {roomsData.map(rm => (
              <div className="nav-card" key={rm} onClick={() => setLocation({ ...location, room: rm })}>
                <div className="nav-icon">🚪</div><h3>{rm}</h3><p>4 Giường</p>
              </div>
            ))}
          </div>
        )}

        {/* MÀN HÌNH 4: QUẢN LÝ GIƯỜNG TRONG PHÒNG ĐÃ CHỌN */}
        {location.room && (
          <div className="beds-grid">
            {/* Vòng lặp lấy danh sách giường của đúng phòng hiện tại */}
            {currentBeds.map(bed => (
              bed.patient ? (
                <BedCard key={bed.id} bed={bed} deviceData={devicesData[bed.patient.device]} onDischarge={handleDischarge} />
              ) : (
                <div className="bed-card-empty" key={bed.id} onClick={() => { setSelectedBed(bed.id); setShowModal(true); }}>
                  <div className="empty-icon">+</div><h3>GIƯỜNG {bed.id}</h3><p>Nhấn để thêm bệnh nhân</p>
                </div>
              )
            ))}
          </div>
        )}
      </main>

      {/* POPUP NHẬP VIỆN */}
      <AdmitModal 
        show={showModal} 
        onClose={() => setShowModal(false)} 
        onSubmit={handleCreatePatient} 
        formData={formData} 
        setFormData={setFormData} 
        selectedBed={selectedBed} 
        room={location.room} 
        isUpdating={isUpdating} 
      />
    </div>
  );
}

export default App;