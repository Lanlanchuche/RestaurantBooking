import random
from datetime import datetime
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine
from backend.models import Base, User, UserRole, Restaurant, Branch
from backend.auth import get_password_hash

def seed_hanoi_data():
    print("Bắt đầu tạo dữ liệu mẫu cho Hà Nội...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Xóa các chi nhánh và nhà hàng cũ
        db.query(Branch).delete()
        db.query(Restaurant).delete()
        
        # Tạo 10 chủ nhà hàng
        owners = []
        for i in range(1, 11):
            email = f"owner{i}@hanoi.vn"
            owner = db.query(User).filter(User.email == email).first()
            if not owner:
                owner = User(
                    email=email,
                    hashed_password=get_password_hash("123456"),
                    role=UserRole.RESTAURANT_OWNER,
                )
                db.add(owner)
                db.commit()
                db.refresh(owner)
            
            # Tạo profile nhà hàng
            res = db.query(Restaurant).filter(Restaurant.owner_id == owner.id).first()
            if not res:
                res = Restaurant(
                    owner_id=owner.id,
                    name=f"Hệ thống Nhà hàng Hà Nội {i}",
                    address=f"Trụ sở chính: Hà Nội, Quận {i}",
                    description="Chuỗi nhà hàng nổi tiếng với nhiều chi nhánh tại Hà Nội."
                )
                db.add(res)
                db.commit()
                db.refresh(res)
            
            owners.append(res)
        
        # Danh sách 30 toạ độ rải rác quanh Hà Nội (Hoàn Kiếm, Đống Đa, Ba Đình, Tây Hồ, Cầu Giấy, Thanh Xuân...)
        hanoi_locations = [
            ("Phở Thìn Lò Đúc", "13 Lò Đúc, Hai Bà Trưng, Hà Nội", 21.0177, 105.8569),
            ("Bún Chả Hương Liên", "24 Lê Văn Hưu, Hai Bà Trưng, Hà Nội", 21.0169, 105.8523),
            ("Chả Cá Lã Vọng", "14 Chả Cá, Hoàn Kiếm, Hà Nội", 21.0347, 105.8486),
            ("Quán Ăn Ngon", "18 Phan Bội Châu, Hoàn Kiếm, Hà Nội", 21.0261, 105.8427),
            ("Bún Ốc Bà Giao", "Ngõ 433 Bạch Mai, Hai Bà Trưng, Hà Nội", 21.0028, 105.8507),
            ("Phở Bát Đàn", "49 Bát Đàn, Hoàn Kiếm, Hà Nội", 21.0315, 105.8465),
            ("Kem Thủy Tạ", "1 Lý Thái Tổ, Hoàn Kiếm, Hà Nội", 21.0313, 105.8546),
            ("Pizza 4P's Tràng Tiền", "43 Tràng Tiền, Hoàn Kiếm, Hà Nội", 21.0245, 105.8540),
            ("Maison Sen Buffet", "61 Trần Hưng Đạo, Hoàn Kiếm, Hà Nội", 21.0219, 105.8475),
            ("Nhà Hàng Sen Tây Hồ", "614 Lạc Long Quân, Tây Hồ, Hà Nội", 21.0743, 105.8118),
            ("Bún Bò Huế O Xuân", "3 Quang Trung, Hoàn Kiếm, Hà Nội", 21.0244, 105.8488),
            ("Sushi Hokkaido Sachi", "Vincom Metropolis, Liễu Giai, Ba Đình, Hà Nội", 21.0316, 105.8152),
            ("Haidilao Vincom Center", "Vincom Center Phạm Ngọc Thạch, Đống Đa, Hà Nội", 21.0069, 105.8329),
            ("King BBQ Buffet", "Lotte Center, 54 Liễu Giai, Ba Đình, Hà Nội", 21.0319, 105.8122),
            ("Kichi Kichi", "101B Phạm Ngọc Thạch, Đống Đa, Hà Nội", 21.0075, 105.8321),
            ("Manwah Taiwanese Hotpot", "Thái Hà, Đống Đa, Hà Nội", 21.0118, 105.8213),
            ("Nhà hàng Ngon Garden", "70 Nguyễn Du, Hai Bà Trưng, Hà Nội", 21.0194, 105.8447),
            ("Trúc Lâm Trai (Chay)", "39 Lê Ngọc Hân, Hai Bà Trưng, Hà Nội", 21.0152, 105.8530),
            ("KFC Cầu Giấy", "292 Cầu Giấy, Quan Hoa, Cầu Giấy, Hà Nội", 21.0340, 105.7950),
            ("Highlands Coffee Cột Cờ", "28A Điện Biên Phủ, Ba Đình, Hà Nội", 21.0322, 105.8385),
            ("Cộng Cà Phê", "15 Trúc Bạch, Ba Đình, Hà Nội", 21.0452, 105.8378),
            ("Gogi House", "B4 Phạm Ngọc Thạch, Đống Đa, Hà Nội", 21.0076, 105.8335),
            ("Sumo BBQ", "Hoàng Quốc Việt, Cầu Giấy, Hà Nội", 21.0461, 105.7925),
            ("Lẩu Phan", "Giải Phóng, Hoàng Mai, Hà Nội", 20.9852, 105.8419),
            ("Bia Hơi Hải Xồm", "Hoàng Quốc Việt, Cầu Giấy, Hà Nội", 21.0470, 105.7950),
            ("Dookki Vietnam", "Vincom Trần Duy Hưng, Cầu Giấy, Hà Nội", 21.0084, 105.7936),
            ("Mcdonald's Hồ Gươm", "2 Hàng Bài, Hoàn Kiếm, Hà Nội", 21.0249, 105.8524),
            ("Starbucks Lan Viên", "32 Hàng Bài, Hoàn Kiếm, Hà Nội", 21.0210, 105.8517),
            ("Bánh Cuốn Gia Truyền", "14 Hàng Gà, Hoàn Kiếm, Hà Nội", 21.0355, 105.8466),
            ("Xôi Yến", "35B Nguyễn Hữu Huân, Hoàn Kiếm, Hà Nội", 21.0326, 105.8537)
        ]
        
        # Random tạo 30 chi nhánh chia cho 10 owners
        for i, (name, addr, lat, lng) in enumerate(hanoi_locations):
            res = owners[i % 10]
            total = random.randint(10, 50)
            branch = Branch(
                restaurant_id=res.id,
                name=name,
                address=addr,
                latitude=lat,
                longitude=lng,
                phone=f"024{random.randint(1000000, 9999999)}",
                total_tables=total,
                available_tables=random.randint(0, total),
                is_active=True
            )
            db.add(branch)
        
        db.commit()
        print(f"Đã tạo thành công {len(hanoi_locations)} chi nhánh ở khu vực Hà Nội.")
        
    except Exception as e:
        db.rollback()
        print(f"Lỗi khi seed data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_hanoi_data()
