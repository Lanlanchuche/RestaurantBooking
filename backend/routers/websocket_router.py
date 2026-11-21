"""
websocket_router.py

Cung cấp endpoint WebSocket cho các nhà hàng kết nối lên để nhận
dữ liệu trực tiếp (real-time). Dành cho giao diện Dashboard.
"""

import asyncio
import json
import logging
import os

from fastapi import (
    APIRouter,
    Query,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
)
from fastapi import status as http_status
from fastapi.websockets import WebSocketState
from sqlalchemy.orm import Session

from backend import models
from backend.auth import decode_access_token
from backend.database import SessionLocal
from backend.services.websocket_manager import manager


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])


# Mã đóng kết nối theo quy ước WebSocket (4000 - 4999 dành cho ứng dụng).
WS_CLOSE_UNAUTHORIZED: int = 4401
WS_CLOSE_FORBIDDEN: int = 4403

# Nếu client không gửi gì trong khoảng thời gian này thì coi như kết nối
# đã chết. dashboard.js gửi ping mỗi 25 giây nên giá trị mặc định rộng.
WS_IDLE_TIMEOUT_SECONDS: int = int(os.getenv("WS_IDLE_TIMEOUT_SECONDS", "120"))


class WebSocketAuthError(Exception):
    """
    Lỗi xác thực WebSocket, mang theo mã đóng kết nối phù hợp.
    """

    def __init__(self, code: int, reason: str):
        super().__init__(reason)
        self.code = code
        self.reason = reason


# =========================================================
# XAC THUC WEBSOCKET
# =========================================================

def _authenticate_restaurant_token(
    token: str | None,
    restaurant_id: int,
) -> models.User:
    """
    Xác thực JWT và quyền sở hữu nhà hàng trước khi nhận kết nối.

    Nếu bỏ qua bước này thì bất kỳ ai cũng có thể mở
    /ws/restaurant/<id> và xem toàn bộ đơn đặt bàn của nhà hàng khác.

    Args:
        token (str | None): JWT token client gửi qua query string.
        restaurant_id (int): ID nhà hàng client muốn theo dõi.

    Returns:
        models.User: Tài khoản chủ nhà hàng đã được xác thực.

    Raises:
        WebSocketAuthError: Token thiếu/sai/hết hạn, tài khoản không phải
            chủ nhà hàng, hoặc nhà hàng không thuộc về tài khoản này.
    """

    if not token:
        raise WebSocketAuthError(
            WS_CLOSE_UNAUTHORIZED,
            "Thiếu token xác thực.",
        )

    payload = decode_access_token(token)

    if not payload:
        raise WebSocketAuthError(
            WS_CLOSE_UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn.",
        )

    email: str | None = payload.get("sub")

    if not email:
        raise WebSocketAuthError(
            WS_CLOSE_UNAUTHORIZED,
            "Token không hợp lệ.",
        )

    db: Session = SessionLocal()

    try:
        user = (
            db.query(models.User)
            .filter(models.User.email == email)
            .first()
        )

        if user is None or not user.is_active:
            raise WebSocketAuthError(
                WS_CLOSE_UNAUTHORIZED,
                "Tài khoản không tồn tại hoặc đã bị khóa.",
            )

        if user.role != models.UserRole.RESTAURANT_OWNER:
            raise WebSocketAuthError(
                WS_CLOSE_FORBIDDEN,
                "Chỉ chủ nhà hàng mới xem được dashboard.",
            )

        restaurant = (
            db.query(models.Restaurant)
            .filter(
                models.Restaurant.id == restaurant_id,
                models.Restaurant.owner_id == user.id,
            )
            .first()
        )

        if restaurant is None:
            logger.warning(
                "WebSocket bị từ chối: user %s cố theo dõi restaurant %s.",
                email,
                restaurant_id,
            )

            raise WebSocketAuthError(
                WS_CLOSE_FORBIDDEN,
                "Nhà hàng không thuộc về tài khoản này.",
            )

        return user

    finally:
        db.close()


def _is_ping_message(data: str) -> bool:
    """
    Kiểm tra tin nhắn giữ kết nối (keepalive) của client.

    dashboard.js gửi JSON {"type": "ping"}, client cũ gửi chuỗi "ping".
    Server phải chấp nhận cả hai và trả "pong", nếu không proxy của Render
    sẽ đóng kết nối đang idle.
    """

    if data == "ping":
        return True

    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return False

    return isinstance(payload, dict) and payload.get("type") == "ping"


async def _safe_close(websocket: WebSocket, code: int) -> None:
    """Đóng WebSocket an toàn, bỏ qua lỗi nếu client đã đóng trước."""

    try:
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=code)
    except Exception:
        pass


# =========================================================
# ENDPOINT
# =========================================================

@router.websocket("/restaurant/{restaurant_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    restaurant_id: int,
    token: str = Query(None),
):
    """
    Endpoint WebSocket dành cho nhà hàng.
    Khi kết nối thành công, có thể nhận các sự kiện đặt bàn mới theo thời gian thực.
    Nhà hàng có thể gửi "ping" (chuỗi "ping" hoặc JSON {"type": "ping"}) định kỳ
    để nhận lại "pong", giữ cho kết nối tránh bị ngắt bởi timeout của trình
    duyệt hoặc proxy.

    Args:
        websocket (WebSocket): Đối tượng kết nối WebSocket gốc do FastAPI cung cấp.
        restaurant_id (int): Mã định danh (ID) của nhà hàng.
        token (str): JWT token xác thực của chủ nhà hàng.
    """

    try:
        user = _authenticate_restaurant_token(token, restaurant_id)

    except WebSocketAuthError as exc:
        logger.warning(
            "WebSocket restaurant %s bị từ chối (mã %s): %s",
            restaurant_id,
            exc.code,
            exc.reason,
        )

        await websocket.close(code=exc.code, reason=exc.reason)

        return

    try:
        await manager.connect(websocket, restaurant_id)

    except Exception:
        logger.exception(
            "Không chấp nhận được kết nối WebSocket cho restaurant %s.",
            restaurant_id,
        )

        await _safe_close(
            websocket,
            http_status.WS_1011_INTERNAL_ERROR,
        )

        return

    logger.info(
        "WebSocket kết nối: restaurant %s (user %s)",
        restaurant_id,
        user.email,
    )

    try:
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=WS_IDLE_TIMEOUT_SECONDS,
                )

            except asyncio.TimeoutError:
                logger.info(
                    "Đóng WebSocket restaurant %s: quá %s giây không nhận tin nhắn.",
                    restaurant_id,
                    WS_IDLE_TIMEOUT_SECONDS,
                )

                await _safe_close(
                    websocket,
                    http_status.WS_1000_NORMAL_CLOSURE,
                )

                break

            if _is_ping_message(data):
                try:
                    await websocket.send_json({"type": "pong"})

                except Exception:
                    # Client không còn nhận được dữ liệu.
                    break

    except WebSocketDisconnect:
        pass

    except WebSocketException as exc:
        # Render/proxy có thể cắt kết nối mà client không gửi close frame.
        logger.info(
            "Kết nối WebSocket restaurant %s bị ngắt bất ngờ: %s",
            restaurant_id,
            exc,
        )

    finally:
        # Luôn dọn dẹp: nếu chỉ bắt WebSocketDisconnect thì những kết nối
        # chết theo cách khác vẫn nằm trong manager và bị send lặp lại.
        manager.disconnect(websocket, restaurant_id)
