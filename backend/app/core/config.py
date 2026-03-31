import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # --- CHỐT CỨNG LUÔN, BỎ QUA .ENV ĐỂ TEST ---
    SQLALCHEMY_DATABASE_URL = "postgresql://admin:adminpassword@127.0.0.1:5433/iv_drip_db"

    # InfluxDB
    INFLUX_URL = os.getenv("INFLUX_URL", "http://127.0.0.1:8087")
    INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "my-super-secret-auth-token-123")
    INFLUX_ORG = os.getenv("INFLUX_ORG", "soict")
    INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "telemetry_bucket")

settings = Settings()