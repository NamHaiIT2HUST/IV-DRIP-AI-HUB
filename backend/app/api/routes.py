from fastapi import APIRouter, WebSocket, HTTPException
from pydantic import BaseModel
import asyncio
from app.services.mqtt_service import latest_telemetry, send_mqtt_command
from app.db.postgres import SessionLocal
from app.models.patient import Patient
from app.core.config import settings
from influxdb_client import InfluxDBClient
from datetime import datetime  # 🐛 THÊM DÒNG NÀY ĐỂ XỬ LÝ THỜI GIAN

router = APIRouter()
query_api = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG).query_api()

@router.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    """Ống nước Real-time cho Frontend"""
    await websocket.accept()
    try:
        while True:
            from app.services.mqtt_service import latest_telemetry
            await websocket.send_json(latest_telemetry)
            await asyncio.sleep(0.5)
    except:
        pass

@router.get("/api/telemetry/{device_id}")
def get_historical_data(device_id: str, minutes: int = 5):
    """Lấy lịch sử để Frontend vẽ biểu đồ"""
    query = f'''
        from(bucket: "{settings.INFLUX_BUCKET}")
        |> range(start: -{minutes}m)
        |> filter(fn: (r) => r["_measurement"] == "iv_drip_measurement")
        |> filter(fn: (r) => r["device_id"] == "{device_id}")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
    '''
    try:
        tables = query_api.query(query, org=settings.INFLUX_ORG)
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "time": record.get_time().strftime("%H:%M:%S"),
                    "current": record.values.get("current_rate"),
                    "target": record.values.get("target_rate")
                })
        return {"device_id": device_id, "data_points": len(results), "history": results}
    except Exception as e:
        return {"error": str(e)}
    
class UpdateTargetRequest(BaseModel):
    new_target: float

class AdmitPatientRequest(BaseModel):
    name: str
    device_id: str
    target: float
    bed: str

@router.post("/api/device/{device_id}/target")
def update_target_rate(device_id: str, request: UpdateTargetRequest):
    """API để Bác sĩ cập nhật phác đồ HOẶC kết thúc truyền"""
    db = SessionLocal()
    try:
        # Tìm bệnh nhân đang truyền bằng máy này
        patient = db.query(Patient).filter(Patient.device_id == device_id, Patient.is_active == True).first()
        
        if patient:
            if request.new_target == 0.0:
                # 🛠️ CHỐT SỔ LỊCH SỬ
                patient.is_active = False
                patient.end_time = datetime.now() # Ghi giờ kết thúc thực tế
                patient.device_id = None # Trả máy
                patient.bed_number = f"ARCHIVED_{patient.id}" # Trả giường
                print(f"✅ Đã chốt sổ ca truyền của {patient.full_name}")
            else:
                patient.target_rate = request.new_target
            
            db.commit() # 🚀 PHẢI CÓ DÒNG NÀY DỮ LIỆU MỚI VÀO POSTGRES
        
        send_mqtt_command(device_id, request.new_target)
        return {"status": "success"}
    finally:
        db.close()

@router.post("/api/patients/admit")
def admit_patient(request: AdmitPatientRequest):
    """API để Nhập viện - Đã fix lỗi tranh chấp thiết bị"""
    db = SessionLocal()
    try:
        # 1. KIỂM TRA XEM THIẾT BỊ NÀY CÓ ĐANG BỊ AI CHIẾM GIỮ KHÔNG?
        # Nếu có, ta phải "tước quyền" sử dụng của người cũ
        old_device_owner = db.query(Patient).filter(
            Patient.device_id == request.device_id,
            Patient.is_active == True
        ).first()
        
        if old_device_owner:
            old_device_owner.device_id = None
            old_device_owner.is_active = False
            old_device_owner.end_time = datetime.now()
            # Đổi số giường để tránh trùng lặp sau này
            old_device_owner.bed_number = f"ARCHIVED_AUTO_{old_device_owner.id}"

        # 2. KIỂM TRA XEM GIƯỜNG NÀY ĐÃ CÓ AI CHƯA
        existing_patient = db.query(Patient).filter(Patient.bed_number == request.bed).first()
        
        if existing_patient:
            # Ghi đè người mới vào giường này
            existing_patient.full_name = request.name
            existing_patient.device_id = request.device_id
            existing_patient.target_rate = request.target
            existing_patient.is_active = True
            existing_patient.created_at = datetime.now()
            existing_patient.end_time = None
        else:
            # Tạo hồ sơ mới hoàn toàn
            new_patient = Patient(
                full_name=request.name,
                device_id=request.device_id,
                target_rate=request.target,
                bed_number=request.bed,
                is_active=True
            )
            db.add(new_patient)
            
        db.commit() # Lưu vào DB
        
        # 3. Bắn lệnh MQTT
        send_mqtt_command(request.device_id, request.target)
        
        return {"status": "success", "message": "Nhập viện thành công!"}
    
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

# --- API LẤY LỊCH SỬ HỒ SƠ (PHẢI CÓ ĐOẠN NÀY THÌ TAB LỊCH SỬ MỚI CHẠY) ---
@router.get("/api/patients/history")
def get_patients_history():
    db = SessionLocal()
    try:
        # Lấy tất cả bệnh nhân đã kết thúc (is_active = False)
        # Sắp xếp theo thời gian kết thúc mới nhất lên đầu
        history = db.query(Patient).filter(
            Patient.is_active == False
        ).order_by(Patient.end_time.desc()).all()
        
        print(f"📡 API History: Đã tìm thấy {len(history)} ca truyền đã kết thúc.")
        return history
    except Exception as e:
        print(f"❌ Lỗi khi lấy lịch sử: {e}")
        return []
    finally:
        db.close()