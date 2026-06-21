from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class DAGEdge(Base):
    __tablename__ = "dag_edges"

    id = Column(Integer, primary_key=True, index=True)
    dag_id = Column(Integer, ForeignKey("dags.id"), nullable=False)
    source_node_id = Column(Integer, ForeignKey("dag_nodes.id"), nullable=False)
    target_node_id = Column(Integer, ForeignKey("dag_nodes.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    dag = relationship("DAG", back_populates="edges")
