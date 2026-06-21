from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Float
from sqlalchemy.orm import relationship

from ..database import Base


class DAG(Base):
    __tablename__ = "dags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(Text, default="")
    cron_expression = Column(String, nullable=False, default="*/5 * * * *")
    is_active = Column(Boolean, default=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="dags")
    nodes = relationship("DAGNode", back_populates="dag", cascade="all, delete-orphan")
    edges = relationship("DAGEdge", back_populates="dag", cascade="all, delete-orphan")
    executions = relationship("TaskExecution", back_populates="dag", cascade="all, delete-orphan")
