"""
models.py

Định nghĩa toàn bộ SQLAlchemy model và enum dùng trong TableReserve:
User, Restaurant, Branch, Reservation. Khai báo đầy đủ relationship hai
chiều và `ondelete` cho mọi ForeignKey để đảm bảo tính toàn vẹn dữ liệu
khi xóa (ví dụ: xóa nhà hàng thì xóa luôn các chi nhánh liên quan).

Ghi chú đối chiếu với bản thiết kế DB (FP_table_DBblueprint):
- `User` gộp chung bảng `TaiKhoan` (tài khoản) và `KhachHang` (hồ sơ
  khách hàng) vì Phase 1 chỉ yêu cầu 4 model duy nhất — không tách
  `HoTen` ra bảng riêng. Tương tự, không có bảng `ChuNhaHang` riêng vì
  `Restaurant.owner_id` đã trỏ trực tiếp tới `User` có role
  RESTAURANT_OWNER.
- `Reservation` gộp `DatBan`; trường `MaBan` (FK → bảng `Ban`) được thu
  gọn thành `table_number` (số hiệu bàn) vì hệ thống không quản lý
  bảng `Ban` như một entity riêng trong phạm vi 4 model này.
- Bảng `ChiTietDatBanMonAn`, `MonAn`, `ThongBaoEmail` nằm ngoài phạm vi
  deliverable Phase 1 (Dev 1) nên chưa được model hoá ở đây.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base

# Độ chính xác toạ độ GPS: 6 số thập phân (~0.11m), đủ cho định vị chi
# nhánh và tính toán khoảng cách trong dijkstra_service.py.
COORDINATE_PRECISION: int = 10
COORDINATE_SCALE: int = 6


class UserRole(str, enum.Enum):
    """Vai trò tài khoản — tương ứng cột `VaiTro` (ENUM) trong blueprint."""

    CUSTOMER = "CUSTOMER"
    RESTAURANT_OWNER = "RESTAURANT_OWNER"


class ReservationStatus(str, enum.Enum):
    """
    Trạng thái đặt bàn — tương ứng cột `TrangThai` (ENUM) của bảng
    `DatBan` trong blueprint: ChoXacNhan, DaXacNhan, DaTuChoi, DaHuy,
    HoanThanh.
    """

    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class User(Base):
    """
    Tài khoản người dùng: khách hàng (CUSTOMER) hoặc chủ nhà hàng
    (RESTAURANT_OWNER). Tương ứng bảng `TaiKhoan` + `HoTen` của
    `KhachHang` trong blueprint.
    """

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(15), nullable=True)
    address = Column(String(255), nullable=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.CUSTOMER)
    # Tương ứng TrangThai (BOOLEAN) của TaiKhoan — dùng để kích hoạt/khóa
    # tài khoản mà không cần xóa dữ liệu.
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Một chủ nhà hàng sở hữu duy nhất một Restaurant (quan hệ 1-1).
    restaurant = relationship(
        "Restaurant",
        back_populates="owner",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # Một khách hàng có thể có nhiều đơn đặt bàn.
    reservations = relationship(
        "Reservation",
        back_populates="customer",
        cascade="all, delete-orphan",
    )


class Restaurant(Base):
    """Hồ sơ nhà hàng — tương ứng bảng `NhaHang`, thuộc về một `User`."""

    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="restaurant")

    branches = relationship(
        "Branch",
        back_populates="restaurant",
        cascade="all, delete-orphan",
    )


class Branch(Base):
    """
    Chi nhánh nhà hàng — tương ứng bảng `ChiNhanh`. Có toạ độ GPS làm
    input cho dijkstra_service.py và bộ đếm `available_tables` được
    đồng bộ real-time khi có đặt bàn / hủy bàn.
    """

    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(
        Integer, ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False
    )
    name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=False)
    latitude = Column(
        Numeric(COORDINATE_PRECISION, COORDINATE_SCALE), nullable=False
    )
    longitude = Column(
        Numeric(COORDINATE_PRECISION, COORDINATE_SCALE), nullable=False
    )
    phone = Column(String(15), nullable=True)
    total_tables = Column(Integer, nullable=False)
    available_tables = Column(Integer, nullable=False)
    # Tương ứng TrangThaiHoatDong — cho phép nhà hàng tạm ẩn một chi
    # nhánh khỏi kết quả tìm kiếm mà không cần xóa dữ liệu.
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    restaurant = relationship("Restaurant", back_populates="branches")

    reservations = relationship(
        "Reservation",
        back_populates="branch",
        cascade="all, delete-orphan",
    )


class Reservation(Base):
    """
    Đơn đặt bàn của khách hàng tại một chi nhánh — tương ứng bảng
    `DatBan`. `reservation_time` dùng để tính mốc "trước 24 giờ" khi
    khách hàng hủy (xem cancel_reservation() ở reservation_service.py).
    """

    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    branch_id = Column(
        Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    # Số hiệu bàn được hệ thống "khóa" cho đơn này (tương ứng MaBan
    # trong blueprint); không phải FK vì hệ thống không quản lý bảng
    # `Ban` như một entity riêng trong phạm vi 4 model này.
    table_number = Column(Integer, nullable=True)
    guest_count = Column(Integer, nullable=False)
    reservation_time = Column(DateTime, nullable=False)
    # Tương ứng YeuCauDacBiet — NULL nếu khách không có yêu cầu gì thêm.
    special_request = Column(Text, nullable=True)
    status = Column(
        Enum(ReservationStatus), nullable=False, default=ReservationStatus.PENDING
    )
    # Tương ứng LyDoTuChoi — bắt buộc phải có giá trị khi status =
    # REJECTED; việc validate điều kiện này thuộc về schemas.py /
    # reservation_service.py, không ràng buộc ở tầng model.
    rejection_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    customer = relationship("User", back_populates="reservations")
    branch = relationship("Branch", back_populates="reservations")