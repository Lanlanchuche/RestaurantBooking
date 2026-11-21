"""
Kiểm tra WebSocket: xác thực, ping/pong và dọn dẹp kết nối.

Hai nhóm lỗi từng có trong project:
1. Endpoint /ws/restaurant/<id> không kiểm tra JWT, nên ai cũng xem được
   đơn đặt bàn của nhà hàng khác.
2. Client gửi ping dạng JSON {"type": "ping"} nhưng server chỉ so sánh
   chuỗi "ping", nên không bao giờ trả "pong" và proxy đóng kết nối idle.
"""

import asyncio

import pytest
from fastapi import FastAPI, WebSocketDisconnect
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import models
from backend.auth import create_access_token
from backend.database import Base
from backend.routers import websocket_router
from backend.services.websocket_manager import ConnectionManager


# =========================================================
# FIXTURES
# =========================================================


@pytest.fixture()
def session_factory():
    """Session factory trên SQLite in-memory, dùng riêng cho từng test."""

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    try:
        yield factory

    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def db(session_factory) -> Session:
    session = session_factory()

    try:
        yield session

    finally:
        session.close()


@pytest.fixture()
def app(monkeypatch, session_factory):
    """
    App FastAPI chỉ chứa router WebSocket.

    Router tự mở SessionLocal khi xác thực, vì vậy phải trỏ nó về
    database test (không đụng tới tablereserve.db đang dùng cho dev).
    """

    monkeypatch.setattr(
        websocket_router,
        "SessionLocal",
        session_factory,
    )

    application = FastAPI()
    application.include_router(websocket_router.router)

    return application


@pytest.fixture()
def client(app):
    # websocket_connect không đi qua lifespan nên không cần TestClient context.
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clean_manager():
    """Manager là singleton toàn cục: phải trống trước và sau mỗi test."""

    websocket_router.manager._connections.clear()

    yield

    websocket_router.manager._connections.clear()


# =========================================================
# HELPERS
# =========================================================


def _seed(
    db: Session,
    owner_email: str = "owner@test.vn",
    restaurant_name: str = "Nhà hàng A",
):
    """Tạo một chủ nhà hàng cùng một nhà hàng."""

    owner = models.User(
        email=owner_email,
        hashed_password="hash",
        role=models.UserRole.RESTAURANT_OWNER,
    )

    restaurant = models.Restaurant(owner=owner, name=restaurant_name)

    db.add_all([owner, restaurant])
    db.commit()

    return owner, restaurant


def _token(email: str) -> str:
    return create_access_token({"sub": email})


def _connect(client: TestClient, restaurant_id: int, token: str | None):
    url = f"/ws/restaurant/{restaurant_id}"

    if token:
        url = f"{url}?token={token}"

    return client.websocket_connect(url)


# =========================================================
# XAC THUC
# =========================================================


def test_websocket_without_token_is_closed_with_4401(client, db):
    _, restaurant = _seed(db)

    with pytest.raises(WebSocketDisconnect) as exc:
        with _connect(client, restaurant.id, token=None):
            pass

    assert exc.value.code == websocket_router.WS_CLOSE_UNAUTHORIZED
    assert websocket_router.manager.connection_count(restaurant.id) == 0


def test_websocket_with_invalid_token_is_closed_with_4401(client, db):
    _, restaurant = _seed(db)

    with pytest.raises(WebSocketDisconnect) as exc:
        with _connect(client, restaurant.id, token="token-gia-mao"):
            pass

    assert exc.value.code == websocket_router.WS_CLOSE_UNAUTHORIZED
    assert websocket_router.manager.connection_count(restaurant.id) == 0


def test_websocket_rejects_customer_account(client, db):
    _, restaurant = _seed(db)

    customer_user = models.User(
        email="khach@test.vn",
        hashed_password="hash",
        role=models.UserRole.CUSTOMER,
    )

    db.add(customer_user)
    db.commit()

    with pytest.raises(WebSocketDisconnect) as exc:
        with _connect(client, restaurant.id, _token(customer_user.email)):
            pass

    assert exc.value.code == websocket_router.WS_CLOSE_FORBIDDEN
    assert websocket_router.manager.connection_count(restaurant.id) == 0


def test_websocket_rejects_foreign_restaurant(client, db):
    """Chủ nhà hàng A không được theo dõi dashboard của nhà hàng B."""

    _, other_restaurant = _seed(db, "owner-khac@test.vn", "Nhà hàng B")
    _, restaurant = _seed(db, "owner@test.vn", "Nhà hàng A")

    assert other_restaurant.id != restaurant.id

    with pytest.raises(WebSocketDisconnect) as exc:
        with _connect(client, other_restaurant.id, _token("owner@test.vn")):
            pass

    assert exc.value.code == websocket_router.WS_CLOSE_FORBIDDEN
    assert websocket_router.manager.connection_count(other_restaurant.id) == 0


def test_owner_connects_and_is_registered(client, db):
    _, restaurant = _seed(db)

    with _connect(client, restaurant.id, _token("owner@test.vn")):
        assert websocket_router.manager.connection_count(restaurant.id) == 1

    # Kết nối đóng -> manager không được giữ lại websocket chết.
    assert websocket_router.manager.connection_count(restaurant.id) == 0


# =========================================================
# PING / PONG
# =========================================================


@pytest.mark.parametrize(
    "ping_message",
    ["ping", '{"type": "ping"}'],
    ids=["plain-string", "dashboard-json"],
)
def test_server_answers_both_ping_formats(client, db, ping_message):
    """dashboard.js gửi JSON, client cũ gửi chuỗi: cả hai phải có pong."""

    _, restaurant = _seed(db)

    with _connect(client, restaurant.id, _token("owner@test.vn")) as ws:
        ws.send_text(ping_message)

        assert ws.receive_json() == {"type": "pong"}


def test_unknown_message_is_ignored_but_keeps_connection(client, db):
    """Tin nhắn lạ không được làm rớt kết nối dashboard."""

    _, restaurant = _seed(db)

    with _connect(client, restaurant.id, _token("owner@test.vn")) as ws:
        ws.send_text('{"type": "something-else"}')
        ws.send_text('{"type": "ping"}')

        assert ws.receive_json() == {"type": "pong"}


# =========================================================
# CONNECTION MANAGER
# =========================================================


class _FakeWebSocket:
    """WebSocket giả để kiểm tra manager mà không cần server thật."""

    def __init__(self, fail: bool = False):
        self.sent: list[dict] = []
        self.fail = fail

    async def accept(self):
        pass

    async def send_json(self, payload: dict):
        if self.fail:
            raise RuntimeError("Kết nối đã đóng")

        self.sent.append(payload)


def test_broadcast_skips_dead_connections_and_removes_them():
    manager = ConnectionManager()

    healthy = _FakeWebSocket()
    dead = _FakeWebSocket(fail=True)

    async def scenario():
        await manager.connect(healthy, 7)
        await manager.connect(dead, 7)

        assert manager.connection_count(7) == 2

        # Broadcast không được chết vì một kết nối hỏng, và kết nối hỏng
        # phải bị gỡ ra để lần gửi sau không lặp lại lỗi.
        await manager.broadcast_to_restaurant(7, {"type": "new_reservation"})

        await manager.broadcast_to_restaurant(7, {"type": "pong"})

    asyncio.run(scenario())

    # Client còn sống vẫn nhận được cả hai thông báo.
    assert healthy.sent == [{"type": "new_reservation"}, {"type": "pong"}]

    assert manager.connection_count(7) == 1


def test_broadcast_to_restaurant_without_connections_is_safe():
    manager = ConnectionManager()

    asyncio.run(manager.broadcast_to_restaurant(99, {"type": "pong"}))

    assert manager.connection_count(99) == 0


def test_disconnect_unknown_connection_does_not_break_registry():
    manager = ConnectionManager()

    alive = _FakeWebSocket()

    asyncio.run(manager.connect(alive, 5))

    # Kết nối đã đóng rồi (không còn trong danh sách) không được làm
    # mất các kết nối khác của cùng nhà hàng.
    manager.disconnect(_FakeWebSocket(), 5)

    assert manager.connection_count(5) == 1

    manager.disconnect(alive, 123)

    assert manager.connection_count(5) == 1

    manager.disconnect(alive, 5)

    assert manager.connection_count(5) == 0
