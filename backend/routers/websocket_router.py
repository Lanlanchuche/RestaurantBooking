from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from backend.services.websocket_manager import manager

router = APIRouter(prefix="/ws", tags=["WebSocket"])

@router.websocket("/restaurant/{restaurant_id}")
async def websocket_endpoint(websocket: WebSocket, restaurant_id: int, token: str = Query(None)):
    """
    WebSocket endpoint for restaurant real-time order dashboard.
    Authenticates simply by token presence for phase 2.
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
