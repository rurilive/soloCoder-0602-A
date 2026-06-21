from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models.user import User
from ..models.dag import DAG
from ..models.dag_edge import DAGEdge
from ..schemas.dag import DAGEdgeCreate, DAGEdge as DAGEdgeSchema
from ..services.auth import get_current_user

router = APIRouter(prefix="/api/dags/{dag_id}/edges", tags=["edges"])


def get_dag_and_check_owner(dag_id: int, current_user: User, db: Session) -> DAG:
    dag = db.query(DAG).filter(DAG.id == dag_id, DAG.owner_id == current_user.id).first()
    if not dag:
        raise HTTPException(status_code=404, detail="DAG not found")
    return dag


@router.get("", response_model=List[DAGEdgeSchema])
def list_edges(
    dag_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    edges = db.query(DAGEdge).filter(DAGEdge.dag_id == dag_id).all()
    return edges


@router.post("", response_model=DAGEdgeSchema)
def create_edge(
    dag_id: int,
    edge_in: DAGEdgeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    edge = DAGEdge(dag_id=dag_id, **edge_in.model_dump())
    db.add(edge)
    db.commit()
    db.refresh(edge)
    return edge


@router.delete("/{edge_id}")
def delete_edge(
    dag_id: int,
    edge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)
    edge = db.query(DAGEdge).filter(DAGEdge.id == edge_id, DAGEdge.dag_id == dag_id).first()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")

    db.delete(edge)
    db.commit()
    return {"message": "Edge deleted successfully"}


@router.post("/batch")
def batch_sync_edges(
    dag_id: int,
    edges: List[DAGEdgeCreate],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    get_dag_and_check_owner(dag_id, current_user, db)

    db.query(DAGEdge).filter(DAGEdge.dag_id == dag_id).delete()

    for edge_in in edges:
        edge = DAGEdge(dag_id=dag_id, **edge_in.model_dump())
        db.add(edge)

    db.commit()
    return {"message": "Edges synced successfully", "count": len(edges)}
