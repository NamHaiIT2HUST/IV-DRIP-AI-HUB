from app.db.postgres import engine, Base, SessionLocal
from app.models.patient import Patient 

print("🚀 Bắt đầu quá trình khởi tạo Cơ sở dữ liệu...")
print(f"🔍 Đang dùng URL: {engine.url}")

Base.metadata.create_all(bind=engine)
print("✅ Đã tạo xong cấu trúc các bảng (Tables).")

db = SessionLocal()

try:
    existing_patient = db.query(Patient).filter(Patient.bed_number == "01").first()
    
    if not existing_patient:
        print("💉 Đang tiến hành cấy (Seed) dữ liệu bệnh nhân đầu tiên...")
        dummy_patient = Patient(
            full_name="Nguyễn Văn A",
            bed_number="01",
            device_id="ESP_01",    
            target_rate=45.0,         #
            is_active=True
        )
        db.add(dummy_patient)
        db.commit() 
        print("✅ Đã nhập viện thành công: Bệnh nhân Nguyễn Văn A - Giường 01 - Thiết bị ESP_01")
    else:
        print("ℹ️ Dữ liệu Giường 01 đã tồn tại, bỏ qua bước cấy dữ liệu.")
        
except Exception as e:
    print(f"❌ Có lỗi xảy ra: {e}")
    db.rollback()
finally:
    db.close()
    print("🏁 Hoàn tất Nghi thức Khai trương!")