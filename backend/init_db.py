from app.db.postgres import engine, Base
from app.models.patient import Patient
from sqlalchemy import text

print("🚀 --- CHƯƠNG TRÌNH KHỞI TẠO DATABASE --- 🚀")
print(f"🔍 Kết nối tới: {engine.url}")

try:
    # BƯỚC 1: Dùng lệnh SQL thuần để cưỡng chế xóa bảng cũ (Phá khóa PostgreSQL)
    with engine.connect() as conn:
        print("🧨 Đang đặt mìn phá dỡ bảng cũ...")
        conn.execute(text("DROP TABLE IF EXISTS patients CASCADE;"))
        conn.commit()
        print("💥 Đã xóa sạch bảng patients cũ!")

    # BƯỚC 2: Xây dựng lại cấu trúc bảng mới từ Model Patient
    print("🏗️ Đang xây dựng lại cấu trúc bảng mới...")
    Base.metadata.create_all(bind=engine)
    print("✅ Đã tạo xong bảng patients mới với đầy đủ các cột: created_at, end_time.")

    print("\n💡 GỢI Ý: Database đã sạch sẽ. Bây giờ bạn hãy ra giao diện Web,")
    print("   bấm nút 'LÀM SẠCH DỮ LIỆU' để đồng bộ bộ nhớ trình duyệt nhé!")

except Exception as e:
    print(f"❌ THẤT BẠI: Không thể khởi tạo Database. Lỗi: {e}")

print("\n🏁 --- NGHI THỨC HOÀN TẤT --- 🏁")