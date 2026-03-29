from sqlalchemy import Column, Integer, String, Float, Boolean
from app.db.postgres import Base

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, index=True)
    bed_number = Column(String, unique=True, index=True)
    
    device_id = Column(String, unique=True, index=True) 
    
    target_rate = Column(Float, default=0.0)
    
    is_active = Column(Boolean, default=True)