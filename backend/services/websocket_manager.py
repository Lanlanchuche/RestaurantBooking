"""
websocket_manager.py

Quản lý các kết nối WebSocket thời gian thực giữa server và các nhà hàng,
cho phép đẩy sự kiện đặt bàn mới (push notifications) lên dashboard.
"""

from typing import Dict, List
import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Trình quản lý các kết nối WebSocket, phân nhóm theo restaurant_id.
    """
    def __init__(self):
        """Khởi tạo ConnectionManager với một dictionary trống để lưu kết nối."""
        # Dictionary mapping restaurant_id to a list of active WebSocket connections
        self._connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, restaurant_id: int):
        """
        Chấp nhận và lưu trữ một kết nối WebSocket mới từ nhà hàng.

        Args:
            websocket (WebSocket): Đối tượng kết nối WebSocket từ client.
            restaurant_id (int): ID của nhà hàng đang kết nối.
        """
        await websocket.accept()
        if restaurant_id not in self._connections:
            self._connections[restaurant_id] = []
        self._connections[restaurant_id].append(websocket)

    def disconnect(self, websocket: WebSocket, restaurant_id: int):
        """
        Gỡ bỏ một kết nối WebSocket đã bị ngắt.

        Args:
            websocket (WebSocket): Đối tượng kết nối WebSocket cần xóa.
            restaurant_id (int): ID của nhà hàng sở hữu kết nối.
        """
        if restaurant_id in self._connections:
            if websocket in self._connections[restaurant_id]:
                self._connections[restaurant_id].remove(websocket)
            if not self._connections[restaurant_id]:
                del self._connections[restaurant_id]

    def connection_count(self, restaurant_id: int) -> int:
        """
        Đếm số kết nối đang hoạt động của một nhà hàng.
        Hữu ích cho log và test.
        """
        return len(self._connections.get(restaurant_id, []))

    async def broadcast_to_restaurant(self, restaurant_id: int, payload: dict):
        """
        Gửi dữ liệu JSON tới toàn bộ các client đang kết nối thuộc về một nhà hàng.
        Đồng thời dọn dẹp các kết nối bị lỗi hoặc đã đóng.

        Args:
            restaurant_id (int): ID của nhà hàng cần gửi thông báo.
            payload (dict): Dữ liệu dạng từ điển (sẽ được parse sang JSON) cần gửi đi.
        """
        if restaurant_id not in self._connections:
            return

        # Duyệt trên bản sao: trong lúc await send_json(), một coroutine
        # khác (ngắt kết nối, broadcast khác) có thể sửa danh sách thật
        # và làm phát sinh lỗi "list changed size during iteration".
        connections = list(self._connections[restaurant_id])
        dead_connections = []
        for connection in connections:
            try:
                await connection.send_json(payload)
            except Exception as exc:
                logger.debug(
                    "Không gửi được thông báo WebSocket cho restaurant %s: %s",
                    restaurant_id,
                    exc,
                )
                dead_connections.append(connection)

        # Clean up dead connections
        for dead in dead_connections:
            self.disconnect(dead, restaurant_id)

manager = ConnectionManager()
