from fastapi import FastAPI

#Khởi tạo FastAPI
app = FastAPI(
    title="IV Drip AI Hub - API Server", 
    description="Hệ thống quản lý truyền dịch thông minh",
    version="1.0"
)

#Tạo một Endpoint kiểm tra Server
@app.get("/")
def read_root():
    return {"message": "Trạm chỉ huy Backend đã sẵn sàng!", "status": "Online"}

#Tạo một Endpoint để lấy thông tin thiết bị 
@app.get("/api/devices/{device_id}")
def get_device_status(device_id: str):
    return {
        "device_id": device_id,
        "target_rate": 45.0,
        "current_rate": 45.2,
        "status": "active"
    }