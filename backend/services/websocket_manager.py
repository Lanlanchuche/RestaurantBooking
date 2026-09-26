from typing import Dict, List
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # Dictionary mapping restaurant_id to a list of active WebSocket connections
        self._connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, restaurant_id: int):
        await websocket.accept()
        if restaurant_id not in self._connections:
            self._connections[restaurant_id] = []
        self._connections[restaurant_id].append(websocket)

    def disconnect(self, websocket: WebSocket, restaurant_id: int):
        if restaurant_id in self._connections:
            if websocket in self._connections[restaurant_id]:
                self._connections[restaurant_id].remove(websocket)
            if not self._connections[restaurant_id]:
                del self._connections[restaurant_id]

    async def broadcast_to_restaurant(self, restaurant_id: int, payload: dict):
        if restaurant_id in self._connections:
            dead_connections = []
            for connection in self._connections[restaurant_id]:
                try:
                    await connection.send_json(payload)
                except Exception:
                    dead_connections.append(connection)
            
            # Clean up dead connections
            for dead in dead_connections:
                self.disconnect(dead, restaurant_id)

manager = ConnectionManager()
