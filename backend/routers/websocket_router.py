"""
websocket_router.py

Cung cấp endpoint WebSocket cho các nhà hàng kết nối lên để nhận
dữ liệu trực tiếp (real-time). Dành cho giao diện Dashboard.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from backend.services.websocket_manager import manager

router = APIRouter(prefix="/ws", tags=["WebSocket"])

@router.websocket("/restaurant/{restaurant_id}")
async def websocket_endpoint(websocket: WebSocket, restaurant_id: int, token: str = Query(None)):
    """
    Endpoint WebSocket dành cho nhà hàng.
    Khi kết nối thành công, có thể nhận các sự kiện đặt bàn mới theo thời gian thực.
    Nhà hàng có thể gửi chuỗi "ping" định kỳ để nhận lại "pong", giữ cho kết nối
    tránh bị ngắt bởi timeout của trình duyệt hoặc proxy.

    Args:
        websocket (WebSocket): Đối tượng kết nối WebSocket gốc do FastAPI cung cấp.
        restaurant_id (int): Mã định danh (ID) của nhà hàng.
        token (str): JWT token xác thực của nhà hàng.
    """
    # Simple validation for now, token parsing would ideally happen here
    if not token:
        await websocket.close(code=1008)
        return
        
    await manager.connect(websocket, restaurant_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, restaurant_id)
