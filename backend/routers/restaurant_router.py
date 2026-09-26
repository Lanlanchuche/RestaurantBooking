from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies import get_current_user
from backend import models, schemas

# Mock imports for reservation_service logic until Dev 2 finishes
# Dev 3 assumes these exist per the interface contract in docs
async def confirm_reservation(db, reservation_id, owner):
    # Dummy mock
    pass

async def reject_reservation(db, reservation_id, reason, owner):
    # Dummy mock
    pass

router = APIRouter(prefix="/api/restaurant", tags=["Restaurant"])

@router.post("/", response_model=schemas.RestaurantResponse, status_code=201)
async def create_restaurant(
    data: schemas.RestaurantCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != models.UserRole.RESTAURANT_OWNER:
        raise HTTPException(status_code=403, detail="Chỉ RESTAURANT_OWNER mới có thể tạo nhà hàng")
    
    existing = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Mỗi tài khoản chỉ được tạo 1 nhà hàng")
        
    restaurant = models.Restaurant(**data.model_dump(), owner_id=current_user.id)
    db.add(restaurant)
    db.commit()
    db.refresh(restaurant)
    return restaurant

@router.get("/me", response_model=schemas.RestaurantResponse)
async def get_my_restaurant(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Chưa có hồ sơ nhà hàng")
    return restaurant

@router.put("/me", response_model=schemas.RestaurantResponse)
async def update_my_restaurant(
    data: schemas.RestaurantCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Chưa có hồ sơ nhà hàng")
    
    for key, value in data.model_dump().items():
        setattr(restaurant, key, value)
        
    db.commit()
    db.refresh(restaurant)
    return restaurant

@router.get("/me/branches", response_model=List[schemas.BranchResponse])
async def list_branches(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    if not restaurant:
        return []
    return db.query(models.Branch).filter(models.Branch.restaurant_id == restaurant.id).all()

@router.post("/me/branches", response_model=schemas.BranchResponse, status_code=201)
async def add_branch(
    data: schemas.BranchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Chưa có hồ sơ nhà hàng")
        
    branch = models.Branch(
        **data.model_dump(), 
        restaurant_id=restaurant.id,
        available_tables=data.total_tables
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch

@router.patch("/me/branches/{branch_id}", response_model=schemas.BranchResponse)
async def edit_branch(
    branch_id: int,
    data: schemas.BranchUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id, models.Branch.restaurant_id == restaurant.id).first() if restaurant else None
    
    if not branch:
        raise HTTPException(status_code=404, detail="Chi nhánh không tồn tại hoặc không thuộc quyền sở hữu")
        
    update_data = data.model_dump(exclude_unset=True)
    if 'total_tables' in update_data:
        diff = update_data['total_tables'] - branch.total_tables
        branch.available_tables = max(0, min(update_data['total_tables'], branch.available_tables + diff))
        
    for key, value in update_data.items():
        setattr(branch, key, value)
        
    db.commit()
    db.refresh(branch)
    return branch

@router.delete("/me/branches/{branch_id}")
async def delete_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    branch = db.query(models.Branch).filter(models.Branch.id == branch_id, models.Branch.restaurant_id == restaurant.id).first() if restaurant else None
    
    if not branch:
        raise HTTPException(status_code=404, detail="Chi nhánh không tồn tại")
        
    db.delete(branch)
    db.commit()
    return {"detail": "Xóa chi nhánh thành công"}

@router.get("/me/reservations", response_model=List[schemas.ReservationResponse])
async def list_reservations(
    status: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    restaurant = db.query(models.Restaurant).filter(models.Restaurant.owner_id == current_user.id).first()
    if not restaurant:
        return []
        
    query = db.query(models.Reservation).join(models.Branch).filter(models.Branch.restaurant_id == restaurant.id)
    if status:
        query = query.filter(models.Reservation.status == status)
        
    query = query.order_by(models.Reservation.created_at.desc()).offset((page - 1) * limit).limit(limit)
    return query.all()

@router.patch("/me/reservations/{reservation_id}/confirm", response_model=schemas.ReservationResponse)
async def confirm_res(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Using mock until integration
    # Return mocked or handled response 
    res = await confirm_reservation(db, reservation_id, current_user)
    if res:
        return res
    raise HTTPException(status_code=501, detail="Dev 2 chưa implement logic xác nhận")

@router.patch("/me/reservations/{reservation_id}/reject", response_model=schemas.ReservationResponse)
async def reject_res(
    reservation_id: int,
    data: schemas.ReservationReject,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not data.reason:
        raise HTTPException(status_code=422, detail="Lý do từ chối không được để trống")
    res = await reject_reservation(db, reservation_id, data.reason, current_user)
    if res:
        return res
    raise HTTPException(status_code=501, detail="Dev 2 chưa implement logic từ chối")
