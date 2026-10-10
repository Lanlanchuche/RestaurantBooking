from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.database import get_db
from backend import models, schemas, auth
from backend.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Schema dành cho đăng nhập bằng JSON
class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdateMe(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None

class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str
    restaurant_name: str | None = None
    restaurant_email: str | None = None
    restaurant_phone: str | None = None

@router.post("/register", response_model=schemas.UserResponse, status_code=201)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """Đăng ký tài khoản mới."""
    existing_user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký.")
        
    hashed_pwd = auth.get_password_hash(user_in.password)
    new_user = models.User(
        email=user_in.email,
        hashed_password=hashed_pwd,
        role=user_in.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Tạo profile dựa trên role
    if user_in.role == models.UserRole.RESTAURANT_OWNER:
        res_profile = models.Restaurant(
            owner_id=new_user.id,
            name=user_in.restaurant_name or f"Nhà hàng của {user_in.name}",
            description=f"Email liên hệ: {user_in.restaurant_email or user_in.email}"
        )
        db.add(res_profile)
    else:
        # Mặc định là CUSTOMER
        cus_profile = models.Customer(
            user_id=new_user.id,
            full_name=user_in.name,
        )
        db.add(cus_profile)
    
    db.commit()
    return new_user

@router.post("/login")
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Đăng nhập và nhận JWT access token."""
    user = db.query(models.User).filter(models.User.email == user_credentials.email).first()
    if not user or not auth.verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác."
        )
        
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role.value if hasattr(user.role, 'value') else user.role})
    # Lấy tên từ profile tương ứng
    user_name = "Khách"
    if user.role == models.UserRole.CUSTOMER and user.customer_profile:
        user_name = user.customer_profile.full_name
    elif user.role == models.UserRole.RESTAURANT_OWNER and user.restaurant_profile:
        user_name = user.restaurant_profile.name

    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user": {
            "id": user.id, 
            "email": user.email, 
            "role": user.role.value if hasattr(user.role, 'value') else user.role, 
            "name": user_name
        }
    }

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    """Lấy thông tin profile của user đang đăng nhập."""
    return current_user

@router.put("/me")
def update_users_me(
    payload: UserUpdateMe,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Cập nhật thông tin profile của user đang đăng nhập."""
    if payload.email:
        existing_user = db.query(models.User).filter(models.User.email == payload.email, models.User.id != current_user.id).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="Email này đã được sử dụng.")
        current_user.email = payload.email

    if current_user.role == models.UserRole.CUSTOMER and current_user.customer_profile:
        if payload.name is not None:
            current_user.customer_profile.full_name = payload.name
        if payload.phone is not None:
            current_user.customer_profile.phone = payload.phone
        if payload.address is not None:
            current_user.customer_profile.address = payload.address
            
    elif current_user.role == models.UserRole.RESTAURANT_OWNER and current_user.restaurant_profile:
        if payload.name is not None:
            current_user.restaurant_profile.name = payload.name
        if payload.address is not None:
            current_user.restaurant_profile.address = payload.address

    db.commit()
    db.refresh(current_user)
    
    user_name = "Khách"
    if current_user.role == models.UserRole.CUSTOMER and current_user.customer_profile:
        user_name = current_user.customer_profile.full_name
    elif current_user.role == models.UserRole.RESTAURANT_OWNER and current_user.restaurant_profile:
        user_name = current_user.restaurant_profile.name

    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        "name": user_name
    }

@router.delete("/me")
def delete_users_me(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Xóa tài khoản của user đang đăng nhập."""
    db.delete(current_user)
    db.commit()
    return {"detail": "Tài khoản đã được xóa thành công"}
