from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import json
from datetime import datetime

from ..database import get_db
from ..models.user import User
from ..models.dag import DAG
from ..models.task_execution import TaskExecution
from ..models.node_execution import NodeExecution
from ..schemas.execution import TaskExecution as TaskExecutionSchema, LogEntry, StatusUpdate, ExecutionComplete
from ..services.auth import get_current_user, decode_access_token

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

    async def _send_json(self, execution_id: int, data: Dict[str, Any]):
        if execution_id in self.active_connections:
            message = json.dumps(data, default=str)
            dead_connections = []
            for connection in self.active_connections[execution_id]:
                try:
                    await connection.send_text(message)
                except Exception:
                    dead_connections.append(connection)
            for conn in dead_connections:
                self.disconnect(execution_id, conn)

    async def broadcast(self, execution_id: int, message: LogEntry):
        data = {
            "type": "log",
            "node_id": message.node_id,
            "node_name": message.node_name,
            "message": message.message,
            "timestamp": message.timestamp.isoformat(),
            "level": message.level
        }
        await self._send_json(execution_id, data)

    async def broadcast_log(self, execution_id: int, message: LogEntry):
        await self.broadcast(execution_id, message)

    async def broadcast_status(self, execution_id: int, update: StatusUpdate):
        data = {
            "type": "status_update",
            "node_id": update.node_id,
            "node_name": update.node_name,
            "status": update.status,
            "started_at": update.started_at.isoformat() if update.started_at else None,
            "finished_at": update.finished_at.isoformat() if update.finished_at else None
        }
        await self._send_json(execution_id, data)

    async def broadcast_event(self, execution_id: int, event: ExecutionComplete | Any):
        if isinstance(event, ExecutionComplete):
            data = {
                "type": "execution_complete",
                "execution_id": event.execution_id,
                "status": event.status,
                "finished_at": event.finished_at.isoformat()
            }
        else:
            data = {"type": getattr(event, "type", "event"), **event.model_dump()}
            for k, v in data.items():
                if isinstance(v, datetime):
                    data[k] = v.isoformat()
        await self._send_json(execution_id, data)


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


@router.post("/{execution_id}/retry", response_model=TaskExecutionSchema)
def retry_execution_endpoint(
    execution_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    execution = db.query(TaskExecution).filter(TaskExecution.id == execution_id).first()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    dag = db.query(DAG).filter(DAG.id == execution.dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=403, detail="Not authorized")

    if execution.status == "running":
        raise HTTPException(status_code=400, detail="Execution is already running")

    def run_retry_in_background(eid: int):
        try:
            from ..services.executor import retry_execution
            retry_execution(eid)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Retry failed for execution {eid}: {e}", exc_info=True)

    background_tasks.add_task(run_retry_in_background, execution_id)

    db.refresh(execution)
    return execution


@router.websocket("/ws/{execution_id}")
async def websocket_logs(
    websocket: WebSocket,
    execution_id: int,
    token: str = Query(None)
):
    if not token:
        await websocket.accept()
        await websocket.close(code=1008, reason="Missing token")
        return

    try:
        payload = decode_access_token(token)
        user_id: int = payload.get("user_id")
        if user_id is None:
            await websocket.accept()
            await websocket.close(code=1008, reason="Invalid token")
            return
    except Exception:
        await websocket.accept()
        await websocket.close(code=1008, reason="Invalid token")
        return

    from ..database import SessionLocal
    db = SessionLocal()
    try:
        execution = db.query(TaskExecution).filter(TaskExecution.id == execution_id).first()
        if not execution:
            await websocket.accept()
            await websocket.close(code=1008, reason="Execution not found")
            return

        dag = db.query(DAG).filter(DAG.id == execution.dag_id, DAG.owner_id == user_id).first()
        if not dag:
            await websocket.accept()
            await websocket.close(code=1008, reason="Not authorized")
            return
    finally:
        db.close()

    await manager.connect(execution_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(execution_id, websocket)
    except Exception:
        manager.disconnect(execution_id, websocket)
