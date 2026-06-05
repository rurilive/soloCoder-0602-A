import uuid
import json
from typing import Dict, List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Room:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.connections: Set[WebSocket] = set()
        self.drawings: List[Dict] = []


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def create_room(self) -> str:
        room_id = str(uuid.uuid4())[:8]
        self.rooms[room_id] = Room(room_id)
        return room_id

    def get_room(self, room_id: str) -> Room:
        if room_id not in self.rooms:
            raise HTTPException(status_code=404, detail="Room not found")
        return self.rooms[room_id]

    async def connect(self, websocket: WebSocket, room_id: str):
        room = self.get_room(room_id)
        await websocket.accept()
        room.connections.add(websocket)
        await websocket.send_json({
            "type": "init",
            "drawings": room.drawings
        })

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].connections.discard(websocket)

    async def broadcast(self, room_id: str, message: dict, sender: WebSocket):
        room = self.get_room(room_id)
        msg_type = message.get("type")
        if msg_type not in ("pen", "rectangle"):
            return
        room.drawings.append(message)
        for connection in room.connections:
            if connection != sender:
                await connection.send_json(message)


room_manager = RoomManager()


class CreateRoomResponse(BaseModel):
    room_id: str


class RoomInfoResponse(BaseModel):
    room_id: str
    user_count: int
    drawing_count: int


@app.post("/api/rooms", response_model=CreateRoomResponse)
async def create_room():
    room_id = room_manager.create_room()
    return {"room_id": room_id}


@app.get("/api/rooms/{room_id}", response_model=RoomInfoResponse)
async def get_room_info(room_id: str):
    room = room_manager.get_room(room_id)
    return {
        "room_id": room.room_id,
        "user_count": len(room.connections),
        "drawing_count": len(room.drawings)
    }


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    try:
        await room_manager.connect(websocket, room_id)
    except HTTPException:
        await websocket.accept()
        await websocket.close(code=4004)
        return

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await room_manager.broadcast(room_id, message, websocket)
            except json.JSONDecodeError:
                continue
    except WebSocketDisconnect:
        room_manager.disconnect(websocket, room_id)
    except Exception:
        room_manager.disconnect(websocket, room_id)
