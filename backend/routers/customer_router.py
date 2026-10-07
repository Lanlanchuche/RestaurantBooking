"""
Customer Router - TableReserve.

Các API dành cho khách hàng:
- Tìm chi nhánh gần nhất.
- Tạo đặt bàn.
- Xem lịch sử đặt bàn.
- Xem chi tiết đặt bàn.
- Hủy đặt bàn.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend import models
from backend import schemas
from backend.database import get_db
from backend.dependencies import get_current_user
from backend.services import dijkstra_service, reservation_service


router = APIRouter(
    prefix="/api/customer",
    tags=["Customer"],
)


# Dùng tốc độ trung bình để quy đổi khoảng cách đường bộ sang thời gian.
# Đây là giá trị ước tính, không phải thời gian giao thông thực tế.
AVERAGE_DRIVING_SPEED_KMH = 30.0


def _get_customer(
    db: Session,
    current_user: models.User,
) -> models.Customer:
    """Lấy hồ sơ Customer tương ứng với tài khoản đang đăng nhập."""

    customer = (
        db.query(models.Customer)
        .filter(models.Customer.user_id == current_user.id)
        .first()
    )

    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy hồ sơ khách hàng.",
        )

    return customer


@router.get(
    "/branches/nearby",
    response_model=list[schemas.NearbyBranchResponse],
    status_code=status.HTTP_200_OK,
)
async def get_nearby_branches(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    limit: int = Query(5, ge=1, le=5),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.NearbyBranchResponse]:
    """Tìm tối đa 5 chi nhánh đang hoạt động gần vị trí khách hàng."""

    _ = _get_customer(db, current_user)

    branches = (
        db.query(models.Branch)
        .filter(models.Branch.is_active.is_(True))
        .all()
    )

    try:
        results = await dijkstra_service.find_nearest_branches(
            customer_lat=lat,
            customer_lon=lng,
            branches=branches,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tìm chi nhánh gần nhất.",
        ) from exc

    response: list[schemas.NearbyBranchResponse] = []

    for item in results:
        distance_m = float(item["distance_m"])
        distance_km = round(distance_m / 1000.0, 2)

        estimated_time = max(
            1,
            round(distance_km / AVERAGE_DRIVING_SPEED_KMH * 60),
        )

        response.append(
            schemas.NearbyBranchResponse(
                **{
                    **{
                        column.name: getattr(item["branch"], column.name)
                        for column in models.Branch.__table__.columns
                    },
                    "distance_km": distance_km,
                    "estimated_time_minutes": estimated_time,
                }
            )
        )

    return response


@router.post(
    "/reservations",
    response_model=schemas.ReservationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_reservation(
    data: schemas.ReservationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.Reservation:
    """Tạo một reservation mới cho customer đang đăng nhập."""

    customer = _get_customer(db, current_user)

    return await reservation_service.create_reservation(
        db=db,
        customer_id=customer.id,
        branch_id=data.branch_id,
        guest_count=data.guest_count,
        reservation_time=data.reservation_time,
        special_request=data.special_request,
    )


@router.get(
    "/reservations",
    response_model=list[schemas.ReservationResponse],
    status_code=status.HTTP_200_OK,
)
def get_reservations(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    reservation_status: models.ReservationStatus | None = Query(
        default=None,
        alias="status",
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[models.Reservation]:
    """Lấy lịch sử reservation của customer hiện tại."""

    customer = _get_customer(db, current_user)
    skip = (page - 1) * limit

    return reservation_service.get_customer_reservations(
        db=db,
        customer_id=customer.id,
        status=reservation_status,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/reservations/{reservation_id}",
    response_model=schemas.ReservationResponse,
    status_code=status.HTTP_200_OK,
)
def get_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.Reservation:
    """Lấy chi tiết một reservation thuộc customer hiện tại."""

    customer = _get_customer(db, current_user)

    reservation = reservation_service.get_customer_reservation(
        db=db,
        reservation_id=reservation_id,
        customer_id=customer.id,
    )

    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin đặt bàn.",
        )

    return reservation


@router.patch(
    "/reservations/{reservation_id}/cancel",
    response_model=schemas.ReservationResponse,
    status_code=status.HTTP_200_OK,
)
async def cancel_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.Reservation:
    """Hủy reservation của customer hiện tại."""

    customer = _get_customer(db, current_user)

    return await reservation_service.cancel_reservation(
        db=db,
        reservation_id=reservation_id,
        customer_id=customer.id,
    )
