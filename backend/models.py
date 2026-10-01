"""
models.py

Định nghĩa toàn bộ SQLAlchemy model và enum dùng trong TableReserve.
Bao gồm: User (Tài khoản chung), Customer (Hồ sơ khách hàng), 
Restaurant (Hồ sơ nhà hàng), Branch (Chi nhánh), Reservation (Đặt bàn).
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

COORDINATE_PRECISION: int = 10
COORDINATE_SCALE: int = 6


class UserRole(str, enum.Enum):
    """Vai trò tài khoản"""
    CUSTOMER = "CUSTOMER"
    RESTAURANT_OWNER = "RESTAURANT_OWNER"


class ReservationStatus(str, enum.Enum):
    """Trạng thái đặt bàn"""
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"


class User(Base):
    """
    Tài khoản người dùng chung, quản lý thông tin đăng nhập và phân quyền.
    Có quan hệ 1:1 với Customer hoặc Restaurant tùy theo role.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    # Bỏ default=UserRole.CUSTOMER theo góp ý để tránh lỗi ẩn
    role = Column(Enum(UserRole), nullable=False) 
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Quan hệ 1:1 với hồ sơ khách hàng
    customer_profile = relationship(
        "Customer",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # Quan hệ 1:1 với hồ sơ nhà hàng
    restaurant_profile = relationship(
        "Restaurant",
        back_populates="owner",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Customer(Base):
    """
    Hồ sơ khách hàng. Tách biệt khỏi bảng User, chứa các thông tin cá nhân.
    """
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    full_name = Column(String(100), nullable=False)
    phone = Column(String(15), nullable=True)
    address = Column(String(255), nullable=True) # Đã thêm address cho khách hàng

    user = relationship("User", back_populates="customer_profile")

    reservations = relationship(
        "Reservation",
        back_populates="customer",
        cascade="all, delete-orphan",
    )


class Restaurant(Base):
    """Hồ sơ nhà hàng, thuộc về một User (RESTAURANT_OWNER)."""
    __tablename__ = "restaurants"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    name = Column(String(150), nullable=False)
    address = Column(String(255), nullable=True) # Đã thêm address cho nhà hàng
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="restaurant_profile")

    branches = relationship(
        "Branch",
        back_populates="restaurant",
        cascade="all, delete-orphan",
    )


class Branch(Base):
    """Chi nhánh nhà hàng"""
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
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    restaurant = relationship("Restaurant", back_populates="branches")

    reservations = relationship(
        "Reservation",
        back_populates="branch",
        cascade="all, delete-orphan",
    )


class Reservation(Base):
    """Đơn đặt bàn của khách hàng"""
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    # Khóa ngoại trỏ về customers.id thay vì users.id
    customer_id = Column(
        Integer, ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    branch_id = Column(
        Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    table_number = Column(Integer, nullable=True)
    guest_count = Column(Integer, nullable=False)
    reservation_time = Column(DateTime, nullable=False)
    special_request = Column(Text, nullable=True)
    status = Column(
        Enum(ReservationStatus), nullable=False, default=ReservationStatus.PENDING
    )
    rejection_reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    customer = relationship("Customer", back_populates="reservations")
    branch = relationship("Branch", back_populates="reservations")
