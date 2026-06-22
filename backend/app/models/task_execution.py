from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from ..database import Base


class TaskExecution(Base):
    __tablename__ = "task_executions"

    id = Column(Integer, primary_key=True, index=True)
    dag_id = Column(Integer, ForeignKey("dags.id"), nullable=False)
    status = Column(String, default="pending")
    retry_count = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    dag = relationship("DAG", back_populates="executions")
    node_executions = relationship("NodeExecution", back_populates="task_execution", cascade="all, delete-orphan")
