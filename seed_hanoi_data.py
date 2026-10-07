import random
import uuid
from sqlalchemy.orm import Session
from backend.database import engine, Base, SessionLocal
from backend.models import User, Restaurant, Branch, UserRole
from backend.auth import get_password_hash

# Tọa độ gốc: Hồ Gươm, Hà Nội
BASE_LAT = 21.028511
BASE_LNG = 105.854165

# Tên quận để random địa chỉ
DISTRICTS = ["Hoàn Kiếm", "Ba Đình", "Đống Đa", "Cầu Giấy", "Hai Bà Trưng", "Tây Hồ"]

def seed_data():
    print("Đang tạo các bảng trong Database...")
    Base.metadata.create_all(bind=engine)
    
    db: Session = SessionLocal()
    
    # Kiểm tra xem đã có dữ liệu chưa
    if db.query(User).count() > 0:
        print("Database đã có dữ liệu. Hãy xóa file database cũ nếu muốn chạy lại.")
        db.close()
        return

    print("Đang tạo 10 Chủ Nhà Hàng...")
    owners = []
    for i in range(1, 11):
        owner = User(
            email=f"owner{i}@gmail.com",
            password_hash=get_password_hash("123456"),
            name=f"Chủ nhà hàng {i}",
            role=UserRole.RESTAURANT_OWNER
        )
        db.add(owner)
        owners.append(owner)
    
    db.commit()

    print("Đang tạo 10 Nhà Hàng...")
    restaurants = []
    restaurant_names = ["Phở Lý Quốc Sư", "Bún Chả Đắc Kim", "Pizza 4P's", "Haidilao", "Golden Gate", "Manwah", "Kichi Kichi", "Gogi House", "Sumo BBQ", "Chả Cá Lã Vọng"]
    
    for i, owner in enumerate(owners):
        res = Restaurant(
            owner_id=owner.id,
            name=restaurant_names[i],
            email=f"contact@{restaurant_names[i].replace(' ', '').lower()}.vn",
            phone=f"0988000{i:03d}"
        )
        db.add(res)
        restaurants.append(res)
        
    db.commit()

    print("Đang phân bổ 30 Chi nhánh (Branches) quanh Hà Nội...")
    # Mỗi nhà hàng sẽ có 3 chi nhánh
    for res in restaurants:
        for j in range(1, 4):
            # Tạo tọa độ ngẫu nhiên lệch khỏi Hồ Gươm trong bán kính khoảng 5-7km
            lat_offset = random.uniform(-0.05, 0.05)
            lng_offset = random.uniform(-0.05, 0.05)
            
            branch = Branch(
                restaurant_id=res.id,
                name=f"{res.name} - Cơ sở {j}",
                address=f"Số {random.randint(1, 200)} phố ảo, Quận {random.choice(DISTRICTS)}, Hà Nội",
                latitude=BASE_LAT + lat_offset,
                longitude=BASE_LNG + lng_offset,
                total_tables=random.randint(10, 30),
                available_tables=random.randint(5, 15)
            )
            db.add(branch)
            
    db.commit()
    db.close()
    print("✅ Đã tạo thành công 30 chi nhánh nhà hàng tại Hà Nội!")

if __name__ == "__main__":
    seed_data()
