"""
Kiểm tra reservation_service: cấp phát bàn, hoàn trả bàn và race condition.

Các test này tập trung vào bộ đếm available_tables:
- không được bán vượt số bàn thật có;
- bàn chỉ được hoàn trả đúng một lần;
- bộ đếm lệch với database phải được đồng bộ lại.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.database import Base
from backend.services import reservation_service


# =========================================================
# FIXTURES
# =========================================================

@pytest.fixture()
def db():
    """Session SQLAlchemy trên SQLite in-memory, dùng riêng cho từng test."""

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session: Session = TestingSession()

    try:
        yield session

    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture(autouse=True)
def _no_real_email(monkeypatch):
    """Không gọi email thật khi chạy test."""

    async def _noop(*args, **kwargs):
        return None

    for name in (
        "send_booking_received",
        "send_cancelled",
        "send_confirmed",
        "send_rejected",
    ):
        monkeypatch.setattr(reservation_service.email_service, name, _noop)


# =========================================================
# HELPERS
# =========================================================

def _future_time(hours: int = 48) -> datetime:
    """Thời gian đặt bàn ở tương lai (naive UTC, giống cách service đang dùng)."""

    return (
        datetime.now(timezone.utc).replace(tzinfo=None)
        + timedelta(hours=hours)
    )


def _seed(db: Session, total_tables: int = 3, available_tables: int | None = None):
    """Tạo chủ nhà hàng, nhà hàng, chi nhánh và một khách hàng."""

    owner = models.User(
        email="owner@test.vn",
        hashed_password="hash",
        role=models.UserRole.RESTAURANT_OWNER,
    )

    customer_user = models.User(
        email="khach@test.vn",
        hashed_password="hash",
        role=models.UserRole.CUSTOMER,
    )

    restaurant = models.Restaurant(owner=owner, name="Nhà hàng A")

    customer = models.Customer(
        user=customer_user,
        full_name="Nguyễn Văn Khách",
        phone="0900000000",
    )

    branch = models.Branch(
        restaurant=restaurant,
        name="Chi nhánh 1",
        address="Hà Nội",
        latitude=21.0245,
        longitude=105.8412,
        total_tables=total_tables,
        available_tables=(
            total_tables if available_tables is None else available_tables
        ),
    )

    db.add_all([owner, customer_user, restaurant, customer, branch])
    db.commit()

    return branch, customer


async def _run(coroutine):
    """
    Chạy một coroutine của service và chờ luôn các background task
    (email, WebSocket) mà service tạo ra bên trong.
    """

    result = await coroutine

    pending = [
        task
        for task in asyncio.all_tasks()
        if task is not asyncio.current_task()
    ]

    if pending:
        await asyncio.gather(*pending, return_exceptions=True)

    return result


def _create(db: Session, customer_id: int, branch_id: int, hours: int = 48):
    return asyncio.run(
        _run(
            reservation_service.create_reservation(
                db=db,
                customer_id=customer_id,
                branch_id=branch_id,
                guest_count=2,
                reservation_time=_future_time(hours),
            )
        )
    )


# =========================================================
# CAP PHAT BAN
# =========================================================

def test_create_reservation_reserves_one_table(db):
    branch, customer = _seed(db, total_tables=3)

    reservation = _create(db, customer.id, branch.id)

    db.refresh(branch)

    assert reservation.status == models.ReservationStatus.PENDING
    assert branch.available_tables == 2


def test_create_reservation_rejects_when_branch_is_full(db):
    branch, customer = _seed(db, total_tables=1)

    _create(db, customer.id, branch.id)

    with pytest.raises(HTTPException) as exc:
        _create(db, customer.id, branch.id, hours=50)

    assert exc.value.status_code == 409

    db.refresh(branch)

    assert branch.available_tables == 0
    assert db.query(models.Reservation).count() == 1


def test_concurrent_creations_do_not_oversell_tables(db):
    """
    10 request cùng đặt bàn vào chi nhánh chỉ còn 3 bàn.

    Kết quả đúng: 3 thành công, 7 nhận 409, bộ đếm không xuống dưới 0.
    """

    branch, customer = _seed(db, total_tables=3)

    async def run_all():
        results = await asyncio.gather(
            *(
                reservation_service.create_reservation(
                    db=db,
                    customer_id=customer.id,
                    branch_id=branch.id,
                    guest_count=2,
                    reservation_time=_future_time(48 + index),
                )
                for index in range(10)
            ),
            return_exceptions=True,
        )

        pending = [
            task
            for task in asyncio.all_tasks()
            if task is not asyncio.current_task()
        ]

        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        return results

    results = asyncio.run(run_all())

    succeeded = [r for r in results if isinstance(r, models.Reservation)]
    rejected = [r for r in results if isinstance(r, HTTPException)]

    db.expire_all()
    branch = db.get(models.Branch, branch.id)

    assert len(succeeded) == 3
    assert len(rejected) == 7
    assert all(exc.status_code == 409 for exc in rejected)
    assert branch.available_tables == 0
    assert db.query(models.Reservation).count() == 3


def test_drifted_counter_is_resynced_from_database(db):
    """
    available_tables trong database đang sai (0 bàn trống dù chưa có đặt bàn)
    -> service phải đồng bộ lại theo số đặt bàn thực tế.
    """

    branch, customer = _seed(db, total_tables=5, available_tables=0)

    _create(db, customer.id, branch.id)

    db.refresh(branch)

    assert branch.available_tables == 4


# =========================================================
# HOAN TRA BAN
# =========================================================

def test_cancel_returns_table_only_once(db):
    branch, customer = _seed(db, total_tables=2)

    reservation = _create(db, customer.id, branch.id)

    asyncio.run(
        _run(
            reservation_service.cancel_reservation(
                db=db,
                reservation_id=reservation.id,
                customer_id=customer.id,
            )
        )
    )

    db.refresh(branch)

    assert branch.available_tables == 2

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            _run(
                reservation_service.cancel_reservation(
                    db=db,
                    reservation_id=reservation.id,
                    customer_id=customer.id,
                )
            )
        )

    assert exc.value.status_code == 400

    db.refresh(branch)

    assert branch.available_tables == 2
    assert db.query(models.Reservation).count() == 1


def test_reject_then_cancel_returns_table_once(db):
    """Nhà hàng từ chối trước, khách hủy sau -> bàn chỉ được cộng lại một lần."""

    branch, customer = _seed(db, total_tables=2)

    reservation = _create(db, customer.id, branch.id)

    asyncio.run(
        _run(
            reservation_service.reject_reservation(
                db=db,
                reservation_id=reservation.id,
                rejection_reason="Chi nhánh đã kín bàn cho khung giờ này.",
            )
        )
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            _run(
                reservation_service.cancel_reservation(
                    db=db,
                    reservation_id=reservation.id,
                    customer_id=customer.id,
                )
            )
        )

    assert exc.value.status_code == 400

    db.refresh(branch)

    assert branch.available_tables == 2

    rejected = db.query(models.Reservation).one()

    assert rejected.status == models.ReservationStatus.REJECTED
    assert rejected.rejection_reason == "Chi nhánh đã kín bàn cho khung giờ này."


def test_confirm_only_works_on_pending_reservation(db):
    branch, customer = _seed(db, total_tables=2)

    reservation = _create(db, customer.id, branch.id)

    confirmed = asyncio.run(
        _run(
            reservation_service.confirm_reservation(
                db=db,
                reservation_id=reservation.id,
            )
        )
    )

    assert confirmed.status == models.ReservationStatus.CONFIRMED

    # Xác nhận không làm thay đổi bộ đếm bàn.
    db.refresh(branch)

    assert branch.available_tables == 1

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            _run(
                reservation_service.confirm_reservation(
                    db=db,
                    reservation_id=reservation.id,
                )
            )
        )

    assert exc.value.status_code == 400


# =========================================================
# REALTIME PAYLOAD
# =========================================================

@pytest.fixture()
def captured_broadcasts(monkeypatch):
    """Ghi lại mọi payload mà service gửi lên WebSocket."""

    captured = []

    async def fake_broadcast(restaurant_id, payload):
        captured.append((restaurant_id, payload))

    monkeypatch.setattr(
        reservation_service.manager,
        "broadcast_to_restaurant",
        fake_broadcast,
    )

    return captured


def test_new_reservation_broadcast_matches_frontend(db, captured_broadcasts):
    """
    Dashboard khớp tin nhắn theo payload.type / payload.event và cần
    đối tượng đặt bàn đầy đủ trong payload.data.
    """

    branch, customer = _seed(db, total_tables=3)

    reservation = _create(db, customer.id, branch.id)

    assert len(captured_broadcasts) == 1

    restaurant_id, payload = captured_broadcasts[0]

    assert restaurant_id == branch.restaurant_id
    assert payload["type"] == "new_reservation"
    assert payload["event"] == "RESERVATION_CREATED"

    data = payload["data"]

    assert data["id"] == reservation.id
    assert data["status"] == "PENDING"
    assert data["customer_name"] == "Nguyễn Văn Khách"
    assert data["customer_phone"] == "0900000000"
    assert data["branch_name"] == "Chi nhánh 1"
    assert data["guest_count"] == 2


def test_cancel_broadcasts_updated_status(db, captured_broadcasts):
    """Nhà hàng phải biết khách đã hủy đơn mà không cần reload trang."""

    branch, customer = _seed(db, total_tables=2)

    reservation = _create(db, customer.id, branch.id)

    asyncio.run(
        _run(
            reservation_service.cancel_reservation(
                db=db,
                reservation_id=reservation.id,
                customer_id=customer.id,
            )
        )
    )

    events = [payload["type"] for _, payload in captured_broadcasts]

    assert events == ["new_reservation", "reservation_updated"]

    payload = captured_broadcasts[-1][1]

    assert payload["event"] == "RESERVATION_UPDATED"
    assert payload["data"]["id"] == reservation.id
    assert payload["data"]["status"] == "CANCELLED"
