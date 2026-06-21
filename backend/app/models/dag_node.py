from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship

from ..database import Base


class DAGNode(Base):
    __tablename__ = "dag_nodes"

    id = Column(Integer, primary_key=True, index=True)
    dag_id = Column(Integer, ForeignKey("dags.id"), nullable=False)
    name = Column(String, nullable=False)
    script_type = Column(String, nullable=False, default="shell")
    script_content = Column(Text, default="")
    position_x = Column(Float, default=0.0)
    position_y = Column(Float, default=0.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    dag = relationship("DAG", back_populates="nodes")
    executions = relationship("NodeExecution", back_populates="node", cascade="all, delete-orphan")
