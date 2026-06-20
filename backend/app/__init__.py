from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .core import settings, init_db
from .routers import clients_router, auth_router, oauth2_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description="OAuth2.0 Simplified Unified Authentication Center",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(clients_router)
    app.include_router(auth_router)
    app.include_router(oauth2_router)

    @app.get("/health")
    async def health_check() -> dict:
        return {"status": "ok", "service": settings.app_name}

    return app
