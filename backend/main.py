from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import paho.mqtt.client as mqtt
import asyncio
import json

app = FastAPI(title="IV Drip AI Hub - Core API")

#Cấu hình CROCS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Cho phép mọi cổng
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#LOGIC LẮNG NGHE MQTT
latest_data = {"device": "Đang chờ kết nối...", "current": 0.0, "target": 0.0}

def on_message(client, userdata, msg):
    global latest_data
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        latest_data = payload 
    except:
        pass

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.on_message = on_message
mqtt_client.connect("127.0.0.1", 1883, 60)
mqtt_client.subscribe("hospital/telemetry/#")
mqtt_client.loop_start()

#ĐƯỜNG ỐNG WEBSOCKET CHO FRONTEND
@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(latest_data)
            await asyncio.sleep(0.5)
    except Exception as e:
        print("Frontend đã ngắt kết nối")