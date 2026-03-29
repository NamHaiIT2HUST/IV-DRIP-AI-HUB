from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.api.routes import router
from app.services.mqtt_service import start_mqtt

@asynccontextmanager
async def lifespan(app: FastAPI):
    mqtt_client = start_mqtt()
    yield
    mqtt_client.loop_stop()
    mqtt_client.disconnect()
    print("🛑 Đã ngắt kết nối MQTT an toàn.")

app = FastAPI(title="IV Drip AI Hub - Enterprise API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)