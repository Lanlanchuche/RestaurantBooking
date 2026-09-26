"""
restaurant_router.py

Các API RESTful dành cho RESTAURANT_OWNER quản lý hồ sơ nhà hàng, chi nhánh 
và xử lý các yêu cầu đặt bàn (xác nhận/từ chối).
"""

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
    """
    Tạo mới hồ sơ nhà hàng cho tài khoản hiện tại.

    Args:
        data: Thông tin nhà hàng cần tạo.
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại, bắt buộc role = RESTAURANT_OWNER.

    Returns:
        Đối tượng Restaurant vừa tạo.

    Raises:
        HTTPException(403): Nếu user không phải RESTAURANT_OWNER.
        HTTPException(400): Nếu user đã tạo nhà hàng rồi.
    """
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
    """
    Lấy thông tin nhà hàng của tài khoản hiện tại.

    Args:
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Đối tượng Restaurant.

    Raises:
        HTTPException(404): Nếu user chưa có hồ sơ nhà hàng.
    """
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
    """
    Cập nhật thông tin hồ sơ nhà hàng.

    Args:
        data: Thông tin nhà hàng mới.
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Đối tượng Restaurant sau khi cập nhật.
    """
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
    """
    Lấy danh sách tất cả chi nhánh thuộc về nhà hàng của người dùng.

    Args:
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Danh sách các đối tượng Branch.
    """
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
    """
    Thêm một chi nhánh mới cho nhà hàng.
    Khởi tạo available_tables bằng total_tables.

    Args:
        data: Thông tin chi nhánh cần thêm.
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Đối tượng Branch vừa tạo.
    """
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
    """
    Chỉnh sửa thông tin chi nhánh.
    Nếu thay đổi total_tables, available_tables sẽ được tự động điều chỉnh bù trừ.

    Args:
        branch_id: ID chi nhánh cần sửa.
        data: Dữ liệu cần sửa (có thể không truyền toàn bộ trường).
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Đối tượng Branch đã được sửa.
    """
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
    """
    Xóa một chi nhánh khỏi hệ thống.

    Args:
        branch_id: ID chi nhánh cần xóa.
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Thông báo xóa thành công.
    """
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
    """
    Lấy danh sách các đơn đặt bàn gửi đến nhà hàng, có hỗ trợ phân trang và lọc.

    Args:
        status: (Tùy chọn) Lọc theo trạng thái (PENDING, CONFIRMED, ...).
        page: Số trang.
        limit: Số kết quả mỗi trang.
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.

    Returns:
        Danh sách đơn đặt bàn được sắp xếp mới nhất ở trên.
    """
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
    """
    Xác nhận một đơn đặt bàn đang ở trạng thái PENDING.
    Logic được ủy thác qua hàm mock của Dev 2.

    Args:
        reservation_id: ID đơn đặt bàn.
        db: SQLAlchemy session.
        current_user: Người dùng (chủ nhà hàng).
    """
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
    """
    Từ chối một đơn đặt bàn kèm theo lý do bắt buộc.
    Logic được ủy thác qua hàm mock của Dev 2.

    Args:
        reservation_id: ID đơn đặt bàn.
        data: Request body chứa lý do từ chối.
        db: SQLAlchemy session.
        current_user: Người dùng hiện tại.
    """
    if not data.reason:
        raise HTTPException(status_code=422, detail="Lý do từ chối không được để trống")
    res = await reject_reservation(db, reservation_id, data.reason, current_user)
    if res:
        return res
    raise HTTPException(status_code=501, detail="Dev 2 chưa implement logic từ chối")
