from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from ..database import Base


class NodeExecution(Base):
    __tablename__ = "node_executions"

    id = Column(Integer, primary_key=True, index=True)
    task_execution_id = Column(Integer, ForeignKey("task_executions.id"), nullable=False)
    node_id = Column(Integer, ForeignKey("dag_nodes.id"), nullable=False)
    status = Column(String, default="pending")
    skip_reason = Column(String, default="")
    output_vars = Column(JSON, default=dict)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    log = Column(Text, default="")

    task_execution = relationship("TaskExecution", back_populates="node_executions")
    node = relationship("DAGNode", back_populates="executions")
