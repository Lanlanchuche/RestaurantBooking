"""
schemas.py


"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from models import ReservationStatus, UserRole

# ==========================================
# 1. AUTHENTICATION SCHEMAS
# ==========================================


class UserLogin(BaseModel):
    """Schema cho input đăng nhập."""
    email: EmailStr
    password: str


class Token(BaseModel):
    """Schema cho response trả về JWT."""
    access_token: str
    token_type: str


class TokenData(BaseModel):
    """Schema chứa dữ liệu giải mã từ JWT."""
    id: Optional[int] = None
    role: Optional[UserRole] = None


# ==========================================
# 2. USER SCHEMAS (Chung)
# ==========================================


class UserBase(BaseModel):
    email: EmailStr
    role: UserRole
    is_active: bool = True


class UserResponse(UserBase):
    """Schema chung cho User, trả về từ API /auth/me."""
    id: int
    created_at: datetime
    
    # Cấu hình Pydantic v2 thay thế cho orm_mode=True
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 3. CUSTOMER SCHEMAS
# ==========================================


class CustomerCreate(BaseModel):
    """Schema input cho đăng ký Khách hàng."""
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str
    phone: Optional[str] = None
    address: Optional[str] = None


class CustomerProfileResponse(BaseModel):
    """Schema trả về thông tin hồ sơ Khách hàng."""
    id: int
    full_name: str
    phone: Optional[str]
    address: Optional[str]
    
    model_config = ConfigDict(from_attributes=True)


class CustomerResponse(UserResponse):
    """Schema trả về Khách hàng bao gồm cả thông tin User và Profile."""
    customer_profile: Optional[CustomerProfileResponse]


# ==========================================
# 4. RESTAURANT SCHEMAS
# ==========================================


class RestaurantOwnerCreate(BaseModel):
    """Schema input cho đăng ký Chủ nhà hàng (chưa có thông tin quán)."""
    email: EmailStr
    password: str = Field(..., min_length=6)


class RestaurantCreate(BaseModel):
    """Schema input cho việc tạo/cập nhật hồ sơ nhà hàng."""
    name: str = Field(..., min_length=2, max_length=150)
    address: Optional[str] = None
    description: Optional[str] = None


class RestaurantProfileResponse(RestaurantCreate):
    """Schema trả về thông tin hồ sơ nhà hàng."""
    id: int
    owner_id: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class RestaurantResponse(UserResponse):
    """Schema trả về Chủ nhà hàng bao gồm cả thông tin User và Profile quán."""
    restaurant_profile: Optional[RestaurantProfileResponse]


# ==========================================
# 5. BRANCH SCHEMAS
# ==========================================


class BranchBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    address: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    total_tables: int = Field(..., gt=0)
    is_active: bool = True


class BranchCreate(BranchBase):
    """Schema input để tạo chi nhánh."""
    pass


class BranchUpdate(BaseModel):
    """Schema input để cập nhật chi nhánh (các trường đều optional)."""
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    phone: Optional[str] = None
    total_tables: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None


class BranchResponse(BranchBase):
    """Schema trả về thông tin chi nhánh."""
    id: int
    restaurant_id: int
    available_tables: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class NearbyBranchResponse(BranchResponse):
    """Schema mở rộng cho chi nhánh, thêm kết quả tính toán Dijkstra."""
    distance_km: float
    estimated_time_minutes: int


# ==========================================
# 6. RESERVATION SCHEMAS
# ==========================================


class ReservationCreate(BaseModel):
    """Schema input để đặt bàn."""
    branch_id: int
    guest_count: int = Field(..., gt=0)
    reservation_time: datetime
    special_request: Optional[str] = None


class ReservationReject(BaseModel):
    """Schema input khi chủ quán từ chối (bắt buộc có lý do)."""
    rejection_reason: str = Field(..., min_length=5)


class ReservationResponse(BaseModel):
    """Schema trả về thông tin đặt bàn."""
    id: int
    customer_id: int
    branch_id: int
    table_number: Optional[int]
    guest_count: int
    reservation_time: datetime
    special_request: Optional[str]
    status: ReservationStatus
    rejection_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    # Nested schemas để trả về thông tin chi tiết
    customer: CustomerProfileResponse
    branch: BranchResponse
    
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 7. GENERIC SCHEMAS
# ==========================================


class MessageResponse(BaseModel):
    """Schema trả về message thông báo tiêu chuẩn."""
    detail: str