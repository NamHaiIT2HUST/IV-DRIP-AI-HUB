from fastapi import APIRouter, WebSocket
import asyncio
from app.services.mqtt_service import latest_telemetry
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