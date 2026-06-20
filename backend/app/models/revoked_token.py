from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index

from ..core.database import Base


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(128), unique=True, index=True, nullable=True)
    token_type = Column(String(16), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    client_id = Column(String(64), ForeignKey("clients.client_id"), nullable=False)
    token_family_id = Column(String(64), index=True, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_revoked_tokens_user_client", "user_id", "client_id"),
        Index("ix_revoked_tokens_family", "token_family_id"),
    )
