import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # PostgreSQL
    POSTGRES_USER = os.getenv("POSTGRES_USER", "admin")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "secretpassword")
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
    POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "iv_drip_db")
    
    SQLALCHEMY_DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

    # InfluxDB
    INFLUX_URL = os.getenv("INFLUX_URL", "http://127.0.0.1:8086")
    INFLUX_TOKEN = os.getenv("INFLUX_TOKEN", "my-super-secret-auth-token-123")
    INFLUX_ORG = os.getenv("INFLUX_ORG", "soict")
    INFLUX_BUCKET = os.getenv("INFLUX_BUCKET", "telemetry_bucket")

settings = Settings()