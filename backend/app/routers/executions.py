from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Dict
import json
from datetime import datetime

from ..database import get_db
from ..models.user import User
from ..models.dag import DAG
from ..models.task_execution import TaskExecution
from ..models.node_execution import NodeExecution
from ..schemas.execution import TaskExecution as TaskExecutionSchema, LogEntry
from ..services.auth import get_current_user

router = APIRouter(prefix="/api/executions", tags=["executions"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, execution_id: int, websocket: WebSocket):
        await websocket.accept()
        if execution_id not in self.active_connections:
            self.active_connections[execution_id] = []
        self.active_connections[execution_id].append(websocket)

    def disconnect(self, execution_id: int, websocket: WebSocket):
        if execution_id in self.active_connections:
            self.active_connections[execution_id].remove(websocket)
            if not self.active_connections[execution_id]:
                del self.active_connections[execution_id]

    async def broadcast(self, execution_id: int, message: LogEntry):
        if execution_id in self.active_connections:
            data = json.dumps({
                "node_id": message.node_id,
                "node_name": message.node_name,
                "message": message.message,
                "timestamp": message.timestamp.isoformat(),
                "level": message.level
            })
            for connection in self.active_connections[execution_id]:
                await connection.send_text(data)


manager = ConnectionManager()


@router.get("/dag/{dag_id}", response_model=List[TaskExecutionSchema])
def list_dag_executions(
    dag_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")

    executions = db.query(TaskExecution).filter(
        TaskExecution.dag_id == dag_id
    ).order_by(TaskExecution.created_at.desc()).offset(skip).limit(limit).all()
    return executions


@router.get("/{execution_id}", response_model=TaskExecutionSchema)
def get_execution(
    execution_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    execution = db.query(TaskExecution).filter(TaskExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    dag = db.query(DAG).filter(DAG.id == execution.dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=403, detail="Not authorized")

    return execution


@router.get("/{execution_id}/logs")
def get_execution_logs(
    execution_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    execution = db.query(TaskExecution).filter(TaskExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    dag = db.query(DAG).filter(DAG.id == execution.dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=403, detail="Not authorized")

    node_executions = db.query(NodeExecution).filter(
        NodeExecution.task_execution_id == execution_id
    ).order_by(NodeExecution.id).all()

    logs = []
    for ne in node_executions:
        logs.append({
            "node_id": ne.node_id,
            "node_name": ne.node.name,
            "status": ne.status,
            "started_at": ne.started_at,
            "finished_at": ne.finished_at,
            "log": ne.log
        })
    return logs


@router.websocket("/ws/{execution_id}")
async def websocket_logs(
    websocket: WebSocket,
    execution_id: int
):
    await manager.connect(execution_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(execution_id, websocket)
