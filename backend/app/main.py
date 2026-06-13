import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.auth import get_password_hash
from app.database import Base, async_session, engine
from app.models import User
from app.routers import admin, auth, chat, notifications, posts, sections, upload, users

app = FastAPI(title="Forum API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1112"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(sections.router)
app.include_router(posts.router)
app.include_router(admin.router)
app.include_router(upload.router)
app.include_router(notifications.router)
app.include_router(chat.router)


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        if not result.scalar_one_or_none():
            admin_user = User(
                username="admin",
                email="admin@forum.com",
                hashed_password=get_password_hash("admin123"),
                role="admin",
            )
            session.add(admin_user)
            await session.commit()
