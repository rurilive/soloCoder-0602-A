from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import logging

from ..database import get_db, SessionLocal
from ..models.user import User
from ..models.dag import DAG
from ..models.dag_node import DAGNode
from ..models.dag_edge import DAGEdge
from ..models.task_execution import TaskExecution
from ..models.node_execution import NodeExecution
from ..schemas.dag import DAGCreate, DAGUpdate, DAG as DAGSchema
from ..services.auth import get_current_user
from ..services.scheduler import scheduler_service
from ..services.executor import topological_sort

router = APIRouter(prefix="/api/dags", tags=["dags"])


@router.get("", response_model=List[DAGSchema])
def list_dags(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dags = db.query(DAG).filter(DAG.owner_id == current_user.id).offset(skip).limit(limit).all()
    return dags


@router.post("", response_model=DAGSchema)
def create_dag(
    dag_in: DAGCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = DAG(
        name=dag_in.name,
        description=dag_in.description,
        cron_expression=dag_in.cron_expression,
        is_active=dag_in.is_active,
        owner_id=current_user.id
    )
    db.add(dag)
    db.flush()

    if dag_in.nodes:
        for node_in in dag_in.nodes:
            node = DAGNode(
                dag_id=dag.id,
                name=node_in.name,
                script_type=node_in.script_type,
                script_content=node_in.script_content,
                position_x=node_in.position_x,
                position_y=node_in.position_y
            )
            db.add(node)

    if dag_in.edges:
        db.flush()
        node_map = {}
        for node in db.query(DAGNode).filter(DAGNode.dag_id == dag.id).all():
            node_map[node.name] = node.id

        for edge_in in dag_in.edges:
            source_id = node_map.get(edge_in.source_node_id, edge_in.source_node_id)
            target_id = node_map.get(edge_in.target_node_id, edge_in.target_node_id)
            edge = DAGEdge(
                dag_id=dag.id,
                source_node_id=source_id,
                target_node_id=target_id
            )
            db.add(edge)

    db.commit()
    db.refresh(dag)

    if dag.is_active:
        scheduler_service.schedule_dag(dag.id)

    return dag


@router.get("/{dag_id}", response_model=DAGSchema)
def get_dag(
    dag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")
    return dag


@router.put("/{dag_id}", response_model=DAGSchema)
def update_dag(
    dag_id: int,
    dag_in: DAGUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")

    was_active = dag.is_active
    for field, value in dag_in.model_dump(exclude_unset=True).items():
        setattr(dag, field, value)

    db.commit()
    db.refresh(dag)

    if dag_in.is_active is not None:
        if dag_in.is_active and not was_active:
            scheduler_service.schedule_dag(dag.id)
        elif not dag_in.is_active and was_active:
            scheduler_service.remove_dag(dag.id)

    return dag


@router.delete("/{dag_id}")
def delete_dag(
    dag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")

    scheduler_service.remove_dag(dag.id)
    db.delete(dag)
    db.commit()
    return {"message": "DAG deleted successfully"}


@router.post("/{dag_id}/trigger")
def trigger_dag(
    dag_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")

    nodes = db.query(DAGNode).filter(DAGNode.dag_id == dag_id).all()
    edges = db.query(DAGEdge).filter(DAGEdge.dag_id == dag_id).all()

    if not nodes:
        raise HTTPException(status_code=400, detail="DAG has no nodes")

    try:
        execution_order = topological_sort(nodes, edges)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    task_execution = TaskExecution(
        dag_id=dag_id,
        status="pending",
        started_at=datetime.now(timezone.utc)
    )
    db.add(task_execution)
    db.flush()

    node_map = {node.id: node for node in nodes}
    for node_id in execution_order:
        node = node_map[node_id]
        ne = NodeExecution(
            task_execution_id=task_execution.id,
            node_id=node_id,
            status="pending"
        )
        db.add(ne)

    db.commit()
    db.refresh(task_execution)

    background_tasks.add_task(execute_dag_background, task_execution.id)

    return {"message": "DAG triggered successfully", "execution_id": task_execution.id}


def execute_dag_background(execution_id: int):
    from ..services.executor import execute_script, send_log
    from ..routers.executions import manager
    from ..schemas.execution import LogEntry
    import asyncio

    db = SessionLocal()
    try:
        task_execution = db.query(TaskExecution).filter(
            TaskExecution.id == execution_id
        ).first()
        if not task_execution:
            return

        dag = db.query(DAG).filter(DAG.id == task_execution.dag_id).first()
        if not dag:
            return

        nodes = db.query(DAGNode).filter(DAGNode.dag_id == dag.id).all()
        edges = db.query(DAGEdge).filter(DAGEdge.dag_id == dag.id).all()
        execution_order = topological_sort(nodes, edges)

        task_execution.status = "running"
        db.commit()

        node_map = {node.id: node for node in nodes}
        node_executions = {
            ne.node_id: ne
            for ne in db.query(NodeExecution).filter(
                NodeExecution.task_execution_id == execution_id
            ).all()
        }

        dag_failed = False
        for node_id in execution_order:
            if dag_failed:
                break

            node = node_map[node_id]
            ne = node_executions[node_id]

            ne.status = "running"
            ne.started_at = datetime.now(timezone.utc)
            db.commit()

            log_output = ""
            try:
                returncode, stdout, stderr = execute_script(
                    node.script_type,
                    node.script_content
                )
                log_output = f"=== STDOUT ===\n{stdout}\n"
                if stderr:
                    log_output += f"=== STDERR ===\n{stderr}\n"
                log_output += f"=== Exit code: {returncode} ==="

                if returncode == 0:
                    ne.status = "success"
                else:
                    ne.status = "failed"
                    dag_failed = True
            except Exception as e:
                ne.status = "failed"
                log_output = f"Execution error: {str(e)}"
                dag_failed = True

            ne.log = log_output
            ne.finished_at = datetime.now(timezone.utc)
            db.commit()

        if dag_failed:
            remaining_start = execution_order.index(node_id) + 1
            for remaining_node_id in execution_order[remaining_start:]:
                remaining_ne = node_executions[remaining_node_id]
                remaining_ne.status = "skipped"
                remaining_ne.log = "Skipped due to upstream failure"
                db.commit()

        task_execution.status = "success" if not dag_failed else "failed"
        task_execution.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Error in background execution {execution_id}: {e}", exc_info=True)
        if 'task_execution' in locals():
            task_execution.status = "failed"
            task_execution.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()
