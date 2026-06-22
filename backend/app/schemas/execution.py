from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class NodeExecutionBase(BaseModel):
    node_id: int
    status: str = "pending"
    log: str = ""


class NodeExecution(NodeExecutionBase):
    id: int
    task_execution_id: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskExecutionBase(BaseModel):
    dag_id: int
    status: str = "pending"


class TaskExecutionCreate(TaskExecutionBase):
    pass


class TaskExecution(TaskExecutionBase):
    id: int
    retry_count: int = 0
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    node_executions: List[NodeExecution] = []

    class Config:
        from_attributes = True


class LogEntry(BaseModel):
    node_id: int
    node_name: str
    message: str
    timestamp: datetime
    level: str = "info"


class StatusUpdate(BaseModel):
    type: str = "status_update"
    node_id: Optional[int] = None
    node_name: Optional[str] = None
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


class ExecutionComplete(BaseModel):
    type: str = "execution_complete"
    execution_id: int
    status: str
    finished_at: datetime
