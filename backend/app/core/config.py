import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # --- CHỐT CỨNG LUÔN, BỎ QUA .ENV ĐỂ TEST ---
    SQLALCHEMY_DATABASE_URL = "postgresql://admin:adminpassword@127.0.0.1:5433/iv_drip_db"

    # InfluxDB
    INFLUX_URL = os.getenv("INFLUX_URL", "http://localhost:8087")
    INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "L-Xz9sxCt6nxdlNJJsWMRoXSNGeKgI5z0_6dv_J2HQw4evAix-ry6x0SraDPjCYjtDHQBtj0BU8CAFAQm5QYVw==")
    INFLUX_ORG = os.getenv("INFLUX_ORG", "soict")
    INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "telemetry_bucket")

settings = Settings()