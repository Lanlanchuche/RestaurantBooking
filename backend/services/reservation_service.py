"""
reservation_service.py

Dịch vụ đặt chỗ cho TableReserve.

Chức năng:
- Tạo đặt chỗ
- Hủy đặt chỗ
- Xác nhận đặt chỗ
- Từ chối đặt chỗ
- Lấy lịch sử đặt chỗ

Sử dụng asyncio.Lock theo từng branch để hạn chế race condition
trong cùng một process.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models import Branch, Reservation, ReservationStatus


logger = logging.getLogger(__name__)


# =========================================================
# CONSTANTS
# =========================================================

MIN_GUEST_COUNT = 1
CANCELLATION_LIMIT_HOURS = 24


# =========================================================
# BRANCH LOCKS
# =========================================================

_branch_locks: dict[int, asyncio.Lock] = {}
_branch_locks_guard = asyncio.Lock()


async def _get_branch_lock(branch_id: int) -> asyncio.Lock:
    """Lấy hoặc tạo asyncio.Lock cho một chi nhánh."""

    async with _branch_locks_guard:
        if branch_id not in _branch_locks:
            _branch_locks[branch_id] = asyncio.Lock()

        return _branch_locks[branch_id]


# =========================================================
# DATETIME HELPERS
# =========================================================

def _utc_now() -> datetime:
    """
    Trả về thời gian UTC hiện tại.

    Database của project đang sử dụng datetime không có timezone,
    vì vậy kết quả được chuyển về naive datetime.
    """

    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_datetime(value: datetime) -> datetime:
    """
    Chuẩn hóa datetime về UTC naive datetime.
    """

    if value.tzinfo is None:
        return value

    return value.astimezone(timezone.utc).replace(tzinfo=None)


# =========================================================
# VALIDATION
# =========================================================

def _validate_guest_count(guest_count: int) -> None:
    """Kiểm tra số lượng khách."""

    if guest_count < MIN_GUEST_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Số lượng khách phải ít nhất là 1.",
        )


def _validate_branch_availability(branch: Branch) -> None:
    """
    Kiểm tra tính hợp lệ của bộ đếm bàn.

    Điều kiện:
        0 <= available_tables <= total_tables
    """

    if branch.total_tables < 0:
        logger.error(
            "Branch %s has invalid total_tables=%s.",
            branch.id,
            branch.total_tables,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dữ liệu số lượng bàn của chi nhánh không hợp lệ.",
        )

    if branch.available_tables < 0:
        logger.error(
            "Branch %s has invalid available_tables=%s.",
            branch.id,
            branch.available_tables,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dữ liệu số bàn trống của chi nhánh không hợp lệ.",
        )

    if branch.available_tables > branch.total_tables:
        logger.error(
            "Branch %s has available_tables=%s > total_tables=%s.",
            branch.id,
            branch.available_tables,
            branch.total_tables,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dữ liệu số bàn của chi nhánh không nhất quán.",
        )


def _validate_can_return_table(branch: Branch) -> None:
    """
    Kiểm tra trước khi trả lại một bàn cho branch.

    Nếu available_tables đã bằng total_tables thì database đang
    ở trạng thái không nhất quán.
    """

    _validate_branch_availability(branch)

    if branch.available_tables >= branch.total_tables:
        logger.error(
            "Cannot return table to branch %s: "
            "available_tables=%s, total_tables=%s.",
            branch.id,
            branch.available_tables,
            branch.total_tables,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể hoàn trả bàn do dữ liệu số bàn không nhất quán.",
        )


# =========================================================
# MOCK EXTERNAL SERVICES
# =========================================================
# Dùng tạm trong thời gian Dev 3 chưa hoàn thành.
# Sau này có thể thay bằng email_service và websocket_manager.


async def send_booking_received(
    customer_id: int,
    branch: Branch,
    reservation: Reservation,
) -> None:
    """Mock gửi thông báo khi tạo đặt bàn."""

    pass


async def send_cancelled(
    customer_id: int,
    branch: Branch,
    reservation: Reservation,
) -> None:
    """Mock gửi thông báo khi khách hủy đặt bàn."""

    pass


async def send_confirmed(
    customer_id: int,
    reservation: Reservation,
) -> None:
    """Mock gửi thông báo khi đặt bàn được xác nhận."""

    pass


async def send_rejected(
    customer_id: int,
    reservation: Reservation,
) -> None:
    """Mock gửi thông báo khi đặt bàn bị từ chối."""

    pass


async def broadcast_to_restaurant(
    restaurant_id: int,
    payload: dict,
) -> None:
    """Mock broadcast WebSocket tới nhà hàng."""

    pass


async def _run_external_task(
    task_name: str,
    coroutine,
) -> None:
    """
    Chạy service bên ngoài mà không làm ảnh hưởng transaction chính.

    Nếu Email/WebSocket lỗi, chỉ ghi log.
    """

    try:
        await coroutine
    except Exception:
        logger.exception(
            "External service task failed: %s",
            task_name,
        )


def _create_external_task(
    task_name: str,
    coroutine,
) -> None:
    """
    Tạo background task an toàn.

    Lỗi của Email/WebSocket không làm request chính thất bại.
    """

    asyncio.create_task(
        _run_external_task(
            task_name,
            coroutine,
        )
    )


# =========================================================
# CREATE RESERVATION
# =========================================================

async def create_reservation(
    db: Session,
    customer_id: int,
    branch_id: int,
    guest_count: int,
    reservation_time: datetime,
    special_request: str | None = None,
    table_number: int | None = None,
) -> Reservation:
    """
    Tạo một đặt chỗ mới.

    Luồng:
    1. Validate dữ liệu.
    2. Lock branch.
    3. Kiểm tra branch.
    4. Kiểm tra bàn trống.
    5. Tạo reservation PENDING.
    6. Giảm available_tables.
    7. Commit transaction.
    8. Gửi notification/background task.
    """

    # -----------------------------------------------------
    # 1. Validate input
    # -----------------------------------------------------

    _validate_guest_count(guest_count)

    reservation_time = _normalize_datetime(reservation_time)

    if reservation_time <= _utc_now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thời gian đặt bàn phải ở trong tương lai.",
        )

    # -----------------------------------------------------
    # 2. Get branch lock
    # -----------------------------------------------------

    lock = await _get_branch_lock(branch_id)

    # -----------------------------------------------------
    # 3. Critical section
    # -----------------------------------------------------

    async with lock:

        branch = (
            db.query(Branch)
            .filter(Branch.id == branch_id)
            .first()
        )

        if branch is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy chi nhánh.",
            )

        if not branch.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chi nhánh hiện không hoạt động.",
            )

        _validate_branch_availability(branch)

        # -------------------------------------------------
        # 4. Check available tables
        # -------------------------------------------------

        if branch.available_tables <= 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Xin lỗi, chi nhánh này đã hết bàn trống.",
            )

        # -------------------------------------------------
        # 5. Create reservation
        # -------------------------------------------------

        reservation = Reservation(
            customer_id=customer_id,
            branch_id=branch_id,
            table_number=table_number,
            guest_count=guest_count,
            reservation_time=reservation_time,
            special_request=special_request,
            status=ReservationStatus.PENDING,
        )

        # -------------------------------------------------
        # 6. Decrease available tables
        # -------------------------------------------------

        branch.available_tables -= 1

        db.add(reservation)

        # -------------------------------------------------
        # 7. Commit
        # -------------------------------------------------

        try:
            db.commit()

            db.refresh(reservation)
            db.refresh(branch)

        except Exception:
            db.rollback()

            logger.exception(
                "Failed to create reservation. "
                "customer_id=%s, branch_id=%s",
                customer_id,
                branch_id,
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Lỗi hệ thống khi tạo đặt bàn.",
            )

        # -------------------------------------------------
        # 8. External services
        # -------------------------------------------------

        _create_external_task(
            "send_booking_received",
            send_booking_received(
                customer_id,
                branch,
                reservation,
            ),
        )

        _create_external_task(
            "broadcast_new_reservation",
            broadcast_to_restaurant(
                branch.restaurant_id,
                {
                    "event": "new_reservation",
                    "data": reservation.id,
                },
            ),
        )

        return reservation


# =========================================================
# CANCEL RESERVATION
# =========================================================

async def cancel_reservation(
    db: Session,
    reservation_id: int,
    customer_id: int,
) -> Reservation:
    """
    Hủy đặt bàn của khách hàng.

    Điều kiện:
    - Reservation thuộc customer.
    - Status là PENDING hoặc CONFIRMED.
    - Còn ít nhất 24 giờ trước reservation_time.

    Khi hủy:
    - Status -> CANCELLED
    - available_tables + 1
    """

    # -----------------------------------------------------
    # 1. Find reservation
    # -----------------------------------------------------

    reservation = (
        db.query(Reservation)
        .filter(
            Reservation.id == reservation_id,
            Reservation.customer_id == customer_id,
        )
        .first()
    )

    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy thông tin đặt bàn.",
        )

    # -----------------------------------------------------
    # 2. Validate status
    # -----------------------------------------------------

    if reservation.status not in (
        ReservationStatus.PENDING,
        ReservationStatus.CONFIRMED,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ những đơn PENDING hoặc CONFIRMED mới có thể hủy.",
        )

    # -----------------------------------------------------
    # 3. Validate 24-hour rule
    # -----------------------------------------------------

    reservation_time = _normalize_datetime(
        reservation.reservation_time
    )

    deadline = reservation_time - timedelta(
        hours=CANCELLATION_LIMIT_HOURS
    )

    if _utc_now() > deadline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không thể hủy đặt bàn khi còn dưới 24 giờ.",
        )

    # -----------------------------------------------------
    # 4. Lock branch
    # -----------------------------------------------------

    branch_id = int(reservation.branch_id)

    lock = await _get_branch_lock(branch_id)

    async with lock:

        # -------------------------------------------------
        # 5. Re-query reservation after lock
        # -------------------------------------------------

        reservation = (
            db.query(Reservation)
            .filter(
                Reservation.id == reservation_id,
                Reservation.customer_id == customer_id,
            )
            .first()
        )

        if reservation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy thông tin đặt bàn.",
            )

        if reservation.status not in (
            ReservationStatus.PENDING,
            ReservationStatus.CONFIRMED,
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Đơn đặt bàn này đã được xử lý hoặc đã hủy.",
            )

        # -------------------------------------------------
        # 6. Re-check 24-hour rule inside lock
        # -------------------------------------------------

        reservation_time = _normalize_datetime(
            reservation.reservation_time
        )

        deadline = reservation_time - timedelta(
            hours=CANCELLATION_LIMIT_HOURS
        )

        if _utc_now() > deadline:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Không thể hủy đặt bàn khi còn dưới 24 giờ.",
            )

        # -------------------------------------------------
        # 7. Find branch
        # -------------------------------------------------

        branch = (
            db.query(Branch)
            .filter(Branch.id == reservation.branch_id)
            .first()
        )

        if branch is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy chi nhánh của đặt bàn.",
            )

        _validate_can_return_table(branch)

        # -------------------------------------------------
        # 8. Return table
        # -------------------------------------------------

        branch.available_tables += 1

        # -------------------------------------------------
        # 9. Change status
        # -------------------------------------------------

        reservation.status = ReservationStatus.CANCELLED

        # -------------------------------------------------
        # 10. Commit
        # -------------------------------------------------

        try:
            db.commit()

            db.refresh(reservation)
            db.refresh(branch)

        except Exception:
            db.rollback()

            logger.exception(
                "Failed to cancel reservation %s.",
                reservation_id,
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Lỗi hệ thống khi hủy đặt bàn.",
            )

        # -------------------------------------------------
        # 11. External service
        # -------------------------------------------------

        _create_external_task(
            "send_cancelled",
            send_cancelled(
                customer_id,
                branch,
                reservation,
            ),
        )

        return reservation


# =========================================================
# CONFIRM RESERVATION
# =========================================================

async def confirm_reservation(
    db: Session,
    reservation_id: int,
) -> Reservation:
    """
    Xác nhận reservation PENDING.

    Khi CONFIRMED:
    - Status -> CONFIRMED
    - available_tables không thay đổi
    """

    # -----------------------------------------------------
    # 1. Find reservation
    # -----------------------------------------------------

    reservation = (
        db.query(Reservation)
        .filter(Reservation.id == reservation_id)
        .first()
    )

    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đặt bàn.",
        )

    # -----------------------------------------------------
    # 2. Lock branch
    # -----------------------------------------------------

    lock = await _get_branch_lock(
        int(reservation.branch_id)
    )

    async with lock:

        # -------------------------------------------------
        # 3. Re-query
        # -------------------------------------------------

        reservation = (
            db.query(Reservation)
            .filter(Reservation.id == reservation_id)
            .first()
        )

        if reservation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy đặt bàn.",
            )

        # -------------------------------------------------
        # 4. Validate status
        # -------------------------------------------------

        if reservation.status != ReservationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chỉ có thể xác nhận đơn đang PENDING.",
            )

        # -------------------------------------------------
        # 5. Change status
        # -------------------------------------------------

        reservation.status = ReservationStatus.CONFIRMED

        # -------------------------------------------------
        # 6. Commit
        # -------------------------------------------------

        try:
            db.commit()
            db.refresh(reservation)

        except Exception:
            db.rollback()

            logger.exception(
                "Failed to confirm reservation %s.",
                reservation_id,
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Lỗi hệ thống khi xác nhận đặt bàn.",
            )

        # -------------------------------------------------
        # 7. External service
        # -------------------------------------------------

        _create_external_task(
            "send_confirmed",
            send_confirmed(
                reservation.customer_id,
                reservation,
            ),
        )

        return reservation


# =========================================================
# REJECT RESERVATION
# =========================================================

async def reject_reservation(
    db: Session,
    reservation_id: int,
    rejection_reason: str,
) -> Reservation:
    """
    Từ chối reservation PENDING.

    Điều kiện:
    - rejection_reason không được rỗng.
    - Reservation phải PENDING.

    Khi REJECTED:
    - Status -> REJECTED
    - rejection_reason được lưu.
    - available_tables + 1
    """

    # -----------------------------------------------------
    # 1. Validate reason
    # -----------------------------------------------------

    reason = rejection_reason.strip()

    if not reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phải cung cấp lý do từ chối.",
        )

    # -----------------------------------------------------
    # 2. Find reservation
    # -----------------------------------------------------

    reservation = (
        db.query(Reservation)
        .filter(Reservation.id == reservation_id)
        .first()
    )

    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy đặt bàn.",
        )

    # -----------------------------------------------------
    # 3. Lock branch
    # -----------------------------------------------------

    lock = await _get_branch_lock(
        int(reservation.branch_id)
    )

    async with lock:

        # -------------------------------------------------
        # 4. Re-query
        # -------------------------------------------------

        reservation = (
            db.query(Reservation)
            .filter(Reservation.id == reservation_id)
            .first()
        )

        if reservation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy đặt bàn.",
            )

        # -------------------------------------------------
        # 5. Validate status
        # -------------------------------------------------

        if reservation.status != ReservationStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Chỉ có thể từ chối đơn đang PENDING.",
            )

        # -------------------------------------------------
        # 6. Find branch
        # -------------------------------------------------

        branch = (
            db.query(Branch)
            .filter(Branch.id == reservation.branch_id)
            .first()
        )

        if branch is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Không tìm thấy chi nhánh của đặt bàn.",
            )

        _validate_can_return_table(branch)

        # -------------------------------------------------
        # 7. Return table
        # -------------------------------------------------

        branch.available_tables += 1

        # -------------------------------------------------
        # 8. Update reservation
        # -------------------------------------------------

        reservation.status = ReservationStatus.REJECTED
        reservation.rejection_reason = reason

        # -------------------------------------------------
        # 9. Commit
        # -------------------------------------------------

        try:
            db.commit()

            db.refresh(reservation)
            db.refresh(branch)

        except Exception:
            db.rollback()

            logger.exception(
                "Failed to reject reservation %s.",
                reservation_id,
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Lỗi hệ thống khi từ chối đặt bàn.",
            )

        # -------------------------------------------------
        # 10. External service
        # -------------------------------------------------

        _create_external_task(
            "send_rejected",
            send_rejected(
                reservation.customer_id,
                reservation,
            ),
        )

        return reservation


# =========================================================
# GET CUSTOMER RESERVATIONS
# =========================================================

def get_customer_reservations(
    db: Session,
    customer_id: int,
    status: ReservationStatus | None = None,
    skip: int = 0,
    limit: int = 20,
) -> list[Reservation]:
    """
    Lấy lịch sử đặt bàn của customer.

    Kết quả:
    - Mới nhất trước.
    - Có thể lọc theo status.
    - Có phân trang.
    """

    if skip < 0:
        skip = 0

    if limit <= 0:
        limit = 20

    query = (
        db.query(Reservation)
        .filter(
            Reservation.customer_id == customer_id
        )
    )

    if status is not None:
        query = query.filter(
            Reservation.status == status
        )

    return (
        query
        .order_by(
            Reservation.reservation_time.desc(),
            Reservation.id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )


# =========================================================
# GET ONE CUSTOMER RESERVATION
# =========================================================

def get_customer_reservation(
    db: Session,
    reservation_id: int,
    customer_id: int,
) -> Reservation | None:
    """Lấy một reservation thuộc về customer."""

    return (
        db.query(Reservation)
        .filter(
            Reservation.id == reservation_id,
            Reservation.customer_id == customer_id,
        )
        .first()
    )