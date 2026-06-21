from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class DAGNodeBase(BaseModel):
    name: str
    script_type: str = "shell"
    script_content: str = ""
    position_x: float = 0.0
    position_y: float = 0.0


class DAGNodeCreate(DAGNodeBase):
    pass


class DAGNodeUpdate(BaseModel):
    name: Optional[str] = None
    script_type: Optional[str] = None
    script_content: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class DAGNode(DAGNodeBase):
    id: int
    dag_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DAGEdgeBase(BaseModel):
    source_node_id: int
    target_node_id: int


class DAGEdgeCreate(DAGEdgeBase):
    pass


class DAGEdge(DAGEdgeBase):
    id: int
    dag_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class DAGBase(BaseModel):
    name: str
    description: str = ""
    cron_expression: str = "*/5 * * * *"
    is_active: bool = False


class DAGCreate(DAGBase):
    nodes: Optional[List[DAGNodeCreate]] = None
    edges: Optional[List[DAGEdgeCreate]] = None


class DAGUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    cron_expression: Optional[str] = None
    is_active: Optional[bool] = None


class DAG(DAGBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: datetime
    nodes: List[DAGNode] = []
    edges: List[DAGEdge] = []

    class Config:
        from_attributes = True
