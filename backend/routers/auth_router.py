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

@router.post("/register", response_model=schemas.UserResponse, status_code=201)
def register(user_in: schemas.UserCreate, db: Session = Depends(get_db)):
    """Đăng ký tài khoản mới."""
    existing_user = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email này đã được đăng ký.")
        
    hashed_pwd = auth.get_password_hash(user_in.password)
    new_user = models.User(
        email=user_in.email,
        password_hash=hashed_pwd,
        name=user_in.name,
        phone=user_in.phone,
        role=user_in.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login")
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Đăng nhập và nhận JWT access token."""
    user = db.query(models.User).filter(models.User.email == user_credentials.email).first()
    if not user or not auth.verify_password(user_credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác."
        )
        
    access_token = auth.create_access_token(data={"sub": user.email, "role": user.role.value if hasattr(user.role, 'value') else user.role})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user": {
            "id": user.id, 
            "email": user.email, 
            "role": user.role, 
            "name": user.name
        }
    }

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    """Lấy thông tin profile của user đang đăng nhập."""
    return current_user
