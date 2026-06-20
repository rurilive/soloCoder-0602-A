from .clients import router as clients_router
from .auth import router as auth_router
from .oauth2 import router as oauth2_router

__all__ = ["clients_router", "auth_router", "oauth2_router"]
