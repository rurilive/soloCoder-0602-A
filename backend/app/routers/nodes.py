from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.user import User
from ..models.dag import DAG
from ..models.dag_node import DAGNode
from ..schemas.dag import DAGNodeCreate, DAGNodeUpdate, DAGNode as DAGNodeSchema
from ..services.auth import get_current_user

router = APIRouter(prefix="/api/dags/{dag_id}/nodes", tags=["nodes"])


def get_dag_and_check_owner(dag_id: int, current_user: User, db: Session) -> DAG:
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")
    return dag


@router.get("", response_model=List[DAGNodeSchema])
def list_nodes(
    dag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    nodes = db.query(DAGNode).filter(DAGNode.dag_id == dag_id).all()
    return nodes


@router.post("", response_model=DAGNodeSchema)
def create_node(
    dag_id: int,
    node_in: DAGNodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    node = DAGNode(dag_id=dag_id, **node_in.model_dump())
    db.add(node)
    db.commit()
    db.refresh(node)
    return node


@router.get("/{node_id}", response_model=DAGNodeSchema)
def get_node(
    dag_id: int,
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    node = db.query(DAGNode).filter(DAGNode.id == node_id, DAGNode.dag_id == dag_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.put("/{node_id}", response_model=DAGNodeSchema)
def update_node(
    dag_id: int,
    node_id: int,
    node_in: DAGNodeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    node = db.query(DAGNode).filter(DAGNode.id == node_id, DAGNode.dag_id == dag_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    for field, value in node_in.model_dump(exclude_unset=True).items():
        setattr(node, field, value)

    db.commit()
    db.refresh(node)
    return node


@router.delete("/{node_id}")
def delete_node(
    dag_id: int,
    node_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    node = db.query(DAGNode).filter(DAGNode.id == node_id, DAGNode.dag_id == dag_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    db.delete(node)
    db.commit()
    return {"message": "Node deleted successfully"}
