import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Import các Components đã tách
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

  const [beds, setBeds] = useState([
    { id: "01", patient: null }, { id: "02", patient: null },
    { id: "03", patient: null }, { id: "04", patient: null },
  ]);

  const [devicesData, setDevicesData] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedBed, setSelectedBed] = useState(null);
  const [formData, setFormData] = useState({ name: "", device: "ESP_01", target: "45.0" });
  const [isUpdating, setIsUpdating] = useState(false);

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
        return {
          ...prev,
          [deviceId]: { telemetry: data, history: newHistory.length > 30 ? newHistory.slice(-30) : newHistory }
        };
      });
    };
    ws.onclose = () => setIsConnected(false);
    return () => ws.close();
  }, []);

  const handleCreatePatient = async () => {
    if (!formData.name || !formData.device || !formData.target) return alert("Vui lòng điền đủ thông tin!");
    setIsUpdating(true);
    try {
      await axios.post(`http://localhost:8000/api/patients/admit`, {
        name: formData.name, device_id: formData.device, target: parseFloat(formData.target), bed: selectedBed
      });
      const startTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      setBeds(beds.map(b => b.id === selectedBed ? { ...b, patient: { ...formData, startTime } } : b));
      setShowModal(false);
      setFormData({ name: "", device: "", target: "" });
    } catch (error) { alert("Lỗi gửi lệnh!"); } 
    finally { setIsUpdating(false); }
  };

  const handleDischarge = async (bedId, deviceId) => {
    if(!window.confirm(`Giải phóng Giường ${bedId}?`)) return;
    try {
      await axios.post(`http://localhost:8000/api/device/${deviceId}/target`, { new_target: 0.0 });
      setBeds(beds.map(b => b.id === bedId ? { ...b, patient: null } : b));
    } catch (error) { alert("Lỗi ngắt thiết bị!"); }
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

      <div className="breadcrumb">
        <span className="crumb" onClick={() => setLocation({ building: null, floor: null, room: null })}>Tổng quan Bệnh viện</span>
        {location.building && <><span className="separator">/</span><span className="crumb" onClick={() => setLocation({ ...location, floor: null, room: null })}>{location.building}</span></>}
        {location.floor && <><span className="separator">/</span><span className="crumb" onClick={() => setLocation({ ...location, room: null })}>{location.floor}</span></>}
        {location.room && <><span className="separator">/</span><span className="crumb active">{location.room}</span></>}
      </div>

      <main className="content">
        {!location.building && (
          <div className="nav-grid">
            {Object.keys(hospitalData).map(bldg => (
              <div className="nav-card" key={bldg} onClick={() => setLocation({ ...location, building: bldg })}>
                <div className="nav-icon">🏢</div><h3>{bldg}</h3><p>{hospitalData[bldg].length} Tầng hoạt động</p>
              </div>
            ))}
          </div>
        )}

        {location.building && !location.floor && (
          <div className="nav-grid">
            {hospitalData[location.building].map(flr => (
              <div className="nav-card" key={flr} onClick={() => setLocation({ ...location, floor: flr })}>
                <div className="nav-icon">🚥</div><h3>{flr}</h3><p>4 Phòng điều trị</p>
              </div>
            ))}
          </div>
        )}

        {location.building && location.floor && !location.room && (
          <div className="nav-grid">
            {roomsData.map(rm => (
              <div className="nav-card" key={rm} onClick={() => setLocation({ ...location, room: rm })}>
                <div className="nav-icon">🚪</div><h3>{rm}</h3><p>4 Giường</p>
              </div>
            ))}
          </div>
        )}

        {location.room && (
          <div className="beds-grid">
            {beds.map(bed => (
              bed.patient ? (
                /* GỌI COMPONENT BEDCARD VÀ TRUYỀN DỮ LIỆU VÀO */
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

      {/* GỌI COMPONENT ADMIT MODAL */}
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