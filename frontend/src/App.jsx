import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import BedCard from './components/BedCard';
import AdmitModal from './components/AdmitModal';
import HistoryTab from './components/HistoryTab';

function App() {
  const [location, setLocation] = useState({ building: null, floor: null, room: null });
  
  const hospitalData = {
    "Tòa A (Nội khoa)": ["Tầng 1", "Tầng 2", "Tầng 3"],
    "Tòa B (Hồi sức cấp cứu)": ["Tầng 1 (ICU)", "Tầng 2"],
    "Tòa C (Nhi khoa)": ["Tầng 1", "Tầng 2"]
  };
  const roomsData = ["Phòng 101", "Phòng 102", "Phòng 103", "Phòng 104"];

  const [activeTab, setActiveTab] = useState('MONITOR'); // TRẠNG THÁI TAB

  // 1. LƯU TRỮ DỮ LIỆU THEO DẠNG "CUỐN SỔ"
  const [roomBeds, setRoomBeds] = useState(() => {
    const savedRooms = localStorage.getItem('iv_drip_rooms');
    return savedRooms ? JSON.parse(savedRooms) : {};
  });

  useEffect(() => {
    localStorage.setItem('iv_drip_rooms', JSON.stringify(roomBeds));
  }, [roomBeds]);

  // HÀM TẠO TÊN PHÒNG TỰ ĐỘNG (Giữ nguyên logic bạn cần)
  const getDynamicRooms = (buildingName, floorName) => {
    if (!buildingName || !floorName) return [];
    const bldgMatch = buildingName.match(/Tòa\s+([A-Z])/i);
    const bldgChar = bldgMatch ? bldgMatch[1].toUpperCase() : "X";
    const floorMatch = floorName.match(/Tầng\s+(\d+)/i);
    const floorNum = floorMatch ? floorMatch[1] : "1";
    return ["01", "02", "03", "04"].map(num => `Phòng ${bldgChar}${floorNum}${num}`);
  };

  const currentRooms = getDynamicRooms(location.building, location.floor);
  const currentRoomKey = `${location.building}-${location.floor}-${location.room}`;

  const currentBeds = roomBeds[currentRoomKey] || [
    { id: "01", patient: null }, { id: "02", patient: null },
    { id: "03", patient: null }, { id: "04", patient: null },
  ];

  const usedDevices = Object.values(roomBeds)
    .flat()
    .filter(bed => bed.patient)
    .map(bed => bed.patient.device);

  // STATE HỆ THỐNG & MODAL
  const [devicesData, setDevicesData] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [formData, setFormData] = useState({ name: "", device: "ESP_01", target: "45.0" });
  const [isUpdating, setIsUpdating] = useState(false);

  // WEBSOCKET: CẬP NHẬT ĐỂ CHẠY MULTI-DEVICE (SỬA Ở ĐÂY)
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/telemetry");
    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      const allDevicesData = JSON.parse(event.data); // Nhận Dictionary {ESP_01: {...}, ESP_02: {...}}
      const timeString = new Date().toLocaleTimeString('vi-VN', { hour12: false });
      
      setDevicesData(prev => {
        let newState = { ...prev };
        Object.keys(allDevicesData).forEach(deviceId => {
          const data = allDevicesData[deviceId];
          const prevDevice = prev[deviceId] || { telemetry: {}, history: [] };
          const newHistory = [...prevDevice.history, { time: timeString, current: data.current, target: data.target }];
          newState[deviceId] = { 
            telemetry: data, 
            history: newHistory.length > 30 ? newHistory.slice(-30) : newHistory 
          };
        });
        return newState;
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
      await axios.post(`http://localhost:8000/api/patients/admit`, {
        name: formData.name, 
        device_id: formData.device, 
        target: parseFloat(formData.target), 
        bed: `${currentRoomKey}-${selectedBed}`
      });
      const startTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const updatedBeds = currentBeds.map(b => b.id === selectedBed ? { ...b, patient: { ...formData, startTime } } : b);
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

  const handleDischarge = async (bedId, deviceId) => {
    if(!window.confirm(`Xác nhận giải phóng Giường ${bedId}?`)) return;
    try {
      // 1. Bắn lệnh xuống Backend để chốt sổ vào DB
      await axios.post(`http://localhost:8000/api/device/${deviceId}/target`, { new_target: 0.0 });
      
      // 2. Cập nhật giao diện (Xóa bệnh nhân khỏi giường hiện tại)
      const updatedBeds = currentBeds.map(b => b.id === bedId ? { ...b, patient: null } : b);
      setRoomBeds(prev => ({ ...prev, [currentRoomKey]: updatedBeds }));
      
      // 3. Thông báo thành công
      alert("Đã kết thúc ca truyền và lưu hồ sơ!");
    } catch (error) { 
      alert("Lỗi ngắt thiết bị! Có thể máy đã offline."); 
    }
  };

  // HÀM 3: NÚT QUAY LẠI (BACK)
  const goBack = () => {
    if (location.room) setLocation({ ...location, room: null });
    else if (location.floor) setLocation({ ...location, floor: null });
    else if (location.building) setLocation({ ...location, building: null });
  };

  const getActiveInfusions = () => {
    let activeList = [];
    Object.entries(roomBeds).forEach(([roomKey, bedsArray]) => {
      const [building, floor, room] = roomKey.split('-'); 
      bedsArray.forEach(bed => {
        if (bed.patient) {
          activeList.push({ building, floor, room, bedId: bed.id, patient: bed.patient, device: bed.patient.device });
        }
      });
    });
    return activeList;
  };

  const activePatients = getActiveInfusions();

  return (
    <div className="medical-app">
      <header className="main-header">
        <div className="brand">
          {/* TAB NAVIGATION (GIỮ NGUYÊN STYLE BẠN ĐÃ CÓ) */}
          <div style={{ display: 'flex', gap: '15px', background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '12px', marginRight: '20px' }}>
            <button 
              onClick={() => setActiveTab('MONITOR')}
              style={{ background: activeTab === 'MONITOR' ? '#4776ff' : 'transparent', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s' }}
            >
              📡 GIÁM SÁT REAL-TIME
            </button>
            <button 
              onClick={() => setActiveTab('HISTORY')}
              style={{ background: activeTab === 'HISTORY' ? '#2d3142' : 'transparent', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s' }}
            >
              🗄️ LỊCH SỬ HỒ SƠ
            </button>
          </div>
          <span className="icon-drop">🏥</span><h1>IV DRIP <span className="light">HOSPITAL CMS</span></h1>
        </div>
        <div className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          <span className="pulse-dot"></span>{isConnected ? 'SYSTEM ONLINE' : 'DISCONNECTED'}
        </div>
      </header>

      {/* --- THANH ĐIỀU HƯỚNG BREADCRUMB (Chỉ hiện ở Tab Monitor) --- */}
      {activeTab === 'MONITOR' && (
        <div className="breadcrumb" style={{display: 'flex', justifyContent: 'space-between'}}>
          <div>
            <span className="crumb" onClick={() => setLocation({ building: null, floor: null, room: null })}>Tổng quan</span>
            {location.building && <><span className="separator">/</span><span className="crumb" onClick={() => setLocation({ ...location, floor: null, room: null })}>{location.building}</span></>}
            {location.floor && <><span className="separator">/</span><span className="crumb" onClick={() => setLocation({ ...location, room: null })}>{location.floor}</span></>}
            {location.room && <><span className="separator">/</span><span className="crumb active">{location.room}</span></>}
          </div>
          {location.building && (
            <button 
              onClick={goBack}
              style={{background: 'transparent', border: '1px solid #4776ff', color: '#4776ff', padding: '4px 12px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'}}
            >
              ⬅ QUAY LẠI
            </button>
          )}
        </div>
      )}

      <main className="content">
        {activeTab === 'MONITOR' ? (
          <>
            {/* MÀN HÌNH 1: CHỌN TÒA NHÀ */}
            {!location.building && (
              <>
                <div className="nav-grid">
                  {Object.keys(hospitalData).map(bldg => (
                    <div className="nav-card" key={bldg} onClick={() => setLocation({ ...location, building: bldg })}>
                      <div className="nav-icon">🏢</div><h3>{bldg}</h3><p>{hospitalData[bldg].length} Tầng hoạt động</p>
                    </div>
                  ))}
                </div>

                {/* BẢNG TỔNG HỢP BỆNH NHÂN ĐANG TRUYỀN */}
                <div style={{ marginTop: '50px', background: '#1a1d29', borderRadius: '24px', padding: '30px', border: '1px solid #2d3142', boxShadow: '0 15px 35px rgba(0,0,0,0.2)' }}>
                  <h3 style={{ marginTop: 0, color: '#fff', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #2d3142', paddingBottom: '15px' }}>
                    <span className="pulse-dot" style={{ color: '#00c853' }}></span>
                    TỔNG TRỰC: BỆNH NHÂN ĐANG TRUYỀN DỊCH ({activePatients.length})
                    <button 
                      onClick={() => {
                        if(window.confirm("CẢNH BÁO: Xóa toàn bộ dữ liệu bệnh nhân trên trình duyệt?")) {
                          localStorage.clear();
                          window.location.reload();
                        }
                      }}
                      style={{ marginLeft: 'auto', background: '#ff5252', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                    >
                      🗑️ LÀM SẠCH DỮ LIỆU
                    </button>
                  </h3>

                  {activePatients.length === 0 ? (
                    <p style={{ color: '#9094a6', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                      Toàn bộ thiết bị đang rảnh. Không có bệnh nhân nào đang truyền.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', textAlign: 'left', fontSize: '0.95rem' }}>
                        <thead>
                          <tr style={{ color: '#9094a6', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px' }}>
                            <th style={{ padding: '15px 10px', borderBottom: '1px solid #2d3142' }}>Bệnh nhân</th>
                            <th style={{ padding: '15px 10px', borderBottom: '1px solid #2d3142' }}>Vị trí Giường</th>
                            <th style={{ padding: '15px 10px', borderBottom: '1px solid #2d3142' }}>Thiết bị</th>
                            <th style={{ padding: '15px 10px', borderBottom: '1px solid #2d3142' }}>Bắt đầu</th>
                            <th style={{ padding: '15px 10px', borderBottom: '1px solid #2d3142' }}>Mục tiêu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activePatients.map((info, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(45, 49, 66, 0.4)' }}>
                              <td style={{ padding: '15px 10px', color: '#4776ff', fontWeight: 'bold', fontSize: '1.1rem' }}>{info.patient.name}</td>
                              <td style={{ padding: '15px 10px', color: '#e0e0e0' }}>
                                <span style={{ fontWeight: 'bold' }}>{info.room} - Giường {info.bedId}</span><br/>
                                <span style={{ fontSize: '0.8rem', color: '#9094a6' }}>{info.building}</span>
                              </td>
                              <td style={{ padding: '15px 10px', color: '#00c853', fontFamily: 'JetBrains Mono, monospace' }}>{info.device}</td>
                              <td style={{ padding: '15px 10px', color: '#e0e0e0' }}>{info.patient.startTime}</td>
                              <td style={{ padding: '15px 10px', color: '#ffb300', fontWeight: 'bold' }}>{info.patient.target} bpm</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
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
                {currentRooms.map(rm => (
                  <div className="nav-card" key={rm} onClick={() => setLocation({ ...location, room: rm })}>
                    <div className="nav-icon">🚪</div><h3>{rm}</h3><p>4 Giường</p>
                  </div>
                ))}
              </div>
            )}

            {/* MÀN HÌNH 4: QUẢN LÝ GIƯỜNG TRONG PHÒNG */}
            {location.room && (
              <div className="beds-grid">
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
          </>
        ) : (
          <HistoryTab />
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
        usedDevices={usedDevices}
      />
    </div>
  );
}

export default App;