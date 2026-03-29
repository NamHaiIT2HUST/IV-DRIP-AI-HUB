from fastapi import APIRouter, WebSocket, HTTPException
from pydantic import BaseModel
import asyncio
from app.services.mqtt_service import latest_telemetry, send_mqtt_command
from app.db.postgres import SessionLocal
from app.models.patient import Patient
from app.core.config import settings
from influxdb_client import InfluxDBClient

router = APIRouter()
query_api = InfluxDBClient(url=settings.INFLUX_URL, token=settings.INFLUX_TOKEN, org=settings.INFLUX_ORG).query_api()

@router.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    """Ống nước Real-time cho Frontend"""
    await websocket.accept()
    try:
        while True:
            # Lấy data mới nhất từ biến toàn cục bên mqtt_service
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
    """API để Bác sĩ cập nhật phác đồ điều trị"""
    
    db = SessionLocal()
    try:
        # 1. Tìm bệnh nhân đang dùng máy này trong PostgreSQL
        patient = db.query(Patient).filter(Patient.device_id == device_id, Patient.is_active == True).first()
        
        if not patient:
            raise HTTPException(status_code=404, detail="Không tìm thấy bệnh nhân đang dùng thiết bị này!")
            
        # 2. Cập nhật phác đồ mới vào Database
        patient.target_rate = request.new_target
        db.commit()
        
        # 3. Bắn lệnh MQTT xuống thẳng thiết bị vật lý (ESP32)
        send_mqtt_command(device_id, request.new_target)
        
        return {"status": "success", "message": f"Đã cập nhật phác đồ thành {request.new_target} bpm"}
    finally:
        db.close()

@router.post("/api/patients/admit")
def admit_patient(request: AdmitPatientRequest):
    """API để Bác sĩ Nhập viện và tạo hồ sơ mới"""
    db = SessionLocal()
    try:
        # 1. TỊCH THU THIẾT BỊ TỪ GIƯỜNG CŨ (Bọc thép chống lỗi Unique_device_id)
        old_assignment = db.query(Patient).filter(
            Patient.device_id == request.device_id,
            Patient.bed_number != request.bed
        ).first()
        
        if old_assignment:
            old_assignment.device_id = None
            old_assignment.target_rate = 0.0
            old_assignment.is_active = False

        # 2. KIỂM TRA XEM GIƯỜNG NÀY ĐÃ CÓ AI TRONG DATABASE CHƯA?
        existing_patient = db.query(Patient).filter(Patient.bed_number == request.bed).first()
        
        if existing_patient:
            # Nếu giường đã có hồ sơ -> Ghi đè thông tin người mới lên
            existing_patient.full_name = request.name
            existing_patient.device_id = request.device_id
            existing_patient.target_rate = request.target
            existing_patient.is_active = True
        else:
            # Nếu giường mới tinh -> Tạo hồ sơ mới
            new_patient = Patient(
                full_name=request.name,
                device_id=request.device_id,
                target_rate=request.target,
                bed_number=request.bed,
                is_active=True
            )
            db.add(new_patient)
            
        db.commit() # Chốt lưu vào Database
        
        # 3. Bắn lệnh MQTT xuống đánh thức cái máy phần cứng
        send_mqtt_command(request.device_id, request.target)
        
        return {"status": "success", "message": "Đã tạo hồ sơ và bắt đầu truyền!"}
    
    except Exception as e:
        db.rollback() # Có lỗi thì hủy bỏ, không lưu DB nữa
        print("\n🚨 CẢNH BÁO: ÁN MẠNG TẠI BACKEND!")
        import traceback
        traceback.print_exc() 
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()