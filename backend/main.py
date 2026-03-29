from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
import asyncio
import json
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

app = FastAPI(title="IV Drip AI Hub - Core API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#CẤU HÌNH INFLUXDB
INFLUX_URL = "http://127.0.0.1:8086"
INFLUX_TOKEN = "my-super-secret-auth-token-123" # Khớp với file Docker!
INFLUX_ORG = "soict"
INFLUX_BUCKET = "telemetry_bucket"

influx_client = InfluxDBClient(url=INFLUX_URL, token=INFLUX_TOKEN, org=INFLUX_ORG)
write_api = influx_client.write_api(write_options=SYNCHRONOUS)
query_api = influx_client.query_api()

latest_data = {"device": "Đang kết nối...", "current": 0.0, "target": 0.0, "angle": 0.0}

def on_message(client, userdata, msg):
    global latest_data
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        latest_data = payload 

        point = (
            Point("iv_drip_measurement")
            .tag("device_id", payload.get("device", "unknown")) 
            .field("current_rate", float(payload.get("current", 0)))
            .field("target_rate", float(payload.get("target", 0)))
            .field("valve_angle", float(payload.get("angle", 0)))
        )
        write_api.write(bucket=INFLUX_BUCKET, org=INFLUX_ORG, record=point)
        
    except Exception as e:
        print(f"Lỗi xử lý MQTT/DB: {e}")

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.on_message = on_message
mqtt_client.connect("127.0.0.1", 1883, 60)
mqtt_client.subscribe("hospital/telemetry/#")
mqtt_client.loop_start()

#API Real-time
@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(latest_data)
            await asyncio.sleep(0.5)
    except:
        pass

#API history
@app.get("/api/telemetry/{device_id}")
def get_historical_data(device_id: str, minutes: int = 5):
    """Lấy lịch sử truyền dịch trong X phút gần nhất để vẽ biểu đồ"""
    
    # Mã Flux Query (Ngôn ngữ truy vấn của InfluxDB)
    query = f'''
        from(bucket: "{INFLUX_BUCKET}")
        |> range(start: -{minutes}m)
        |> filter(fn: (r) => r["_measurement"] == "iv_drip_measurement")
        |> filter(fn: (r) => r["device_id"] == "{device_id}")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
    '''
    
    try:
        tables = query_api.query(query, org=INFLUX_ORG)
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