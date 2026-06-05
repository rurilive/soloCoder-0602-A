import aiosqlite
import json
import os
from typing import List, Dict

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "whiteboard.db"))


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS rooms (
                room_id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS drawings (
                id TEXT PRIMARY KEY,
                room_id TEXT,
                drawing_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms(room_id)
            )
            """
        )
        await db.commit()


async def load_all_rooms() -> Dict[str, List[Dict]]:
    rooms_data: Dict[str, List[Dict]] = {}
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            """
            SELECT d.room_id, d.drawing_data
            FROM drawings d
            INNER JOIN rooms r ON d.room_id = r.room_id
            ORDER BY d.created_at ASC
            """
        ) as cursor:
            async for row in cursor:
                room_id, drawing_data = row
                if room_id not in rooms_data:
                    rooms_data[room_id] = []
                rooms_data[room_id].append(json.loads(drawing_data))
    return rooms_data


async def create_room(room_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO rooms (room_id) VALUES (?)",
            (room_id,)
        )
        await db.commit()


async def add_drawing(room_id: str, drawing: Dict):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO rooms (room_id) VALUES (?)",
            (room_id,)
        )
        await db.execute(
            "INSERT OR REPLACE INTO drawings (id, room_id, drawing_data) VALUES (?, ?, ?)",
            (drawing["id"], room_id, json.dumps(drawing))
        )
        await db.commit()


async def delete_drawing(room_id: str, drawing_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "DELETE FROM drawings WHERE room_id = ? AND id = ?",
            (room_id, drawing_id)
        )
        await db.commit()
