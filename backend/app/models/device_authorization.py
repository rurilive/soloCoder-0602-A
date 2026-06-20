from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship

from ..core.database import Base


class DeviceAuthorization(Base):
    __tablename__ = "device_authorizations"

    id = Column(Integer, primary_key=True, index=True)
    device_code = Column(String(255), unique=True, index=True, nullable=False)
    user_code = Column(String(16), unique=True, index=True, nullable=False)
    client_id = Column(String(64), ForeignKey("clients.client_id"), nullable=False)
    scope = Column(String(255), default="read write")
    status = Column(String(16), default="pending", nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    last_polled_at = Column(DateTime, nullable=True)
    interval = Column(Integer, default=5, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    resolved_at = Column(DateTime, nullable=True)

    client = relationship("Client")
    user = relationship("User")
