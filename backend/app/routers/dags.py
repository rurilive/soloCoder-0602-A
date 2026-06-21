from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.user import User
from ..models.dag import DAG
from ..models.dag_node import DAGNode
from ..models.dag_edge import DAGEdge
from ..schemas.dag import DAGCreate, DAGUpdate, DAG as DAGSchema
from ..services.auth import get_current_user
from ..services.scheduler import scheduler_service

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")

    from ..services.executor import execute_dag
    execution = execute_dag(dag.id)
    return {"message": "DAG triggered successfully", "execution_id": execution.id}
