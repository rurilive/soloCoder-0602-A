import subprocess
import sys
import os
import tempfile
from datetime import datetime, timezone
from collections import deque, defaultdict
from typing import List, Dict, Set
import logging

from ..database import SessionLocal
from ..models.dag import DAG
from ..models.dag_node import DAGNode
from ..models.dag_edge import DAGEdge
from ..models.task_execution import TaskExecution
from ..models.node_execution import NodeExecution
from ..schemas.execution import LogEntry
from ..routers.executions import manager

logger = logging.getLogger(__name__)


def topological_sort(nodes: List[DAGNode], edges: List[DAGEdge]) -> List[int]:
    graph = defaultdict(list)
    in_degree = defaultdict(int)

    node_ids = {node.id for node in nodes}
    for edge in edges:
        if edge.source_node_id in node_ids and edge.target_node_id in node_ids:
            graph[edge.source_node_id].append(edge.target_node_id)
            in_degree[edge.target_node_id] += 1

    for node in nodes:
        if node.id not in in_degree:
            in_degree[node.id] = 0

    queue = deque([node_id for node_id, degree in in_degree.items() if degree == 0])
    result = []

    while queue:
        node_id = queue.popleft()
        result.append(node_id)
        for neighbor in graph[node_id]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(result) != len(nodes):
        raise ValueError("Cycle detected in DAG")

    return result


def execute_script(script_type: str, script_content: str) -> tuple[int, str, str]:
    with tempfile.NamedTemporaryFile(mode='w', suffix=f'.{script_type}', delete=False) as f:
        f.write(script_content)
        temp_file = f.name

    try:
        if script_type == "python":
            cmd = [sys.executable, temp_file]
        else:
            cmd = ["bash", temp_file]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,
            env=os.environ.copy()
        )
        return result.returncode, result.stdout, result.stderr
    finally:
        try:
            os.unlink(temp_file)
        except:
            pass


async def send_log(execution_id: int, node_id: int, node_name: str, message: str, level: str = "info"):
    log_entry = LogEntry(
        node_id=node_id,
        node_name=node_name,
        message=message,
        timestamp=datetime.now(timezone.utc),
        level=level
    )
    await manager.broadcast(execution_id, log_entry)


def execute_dag(dag_id: int) -> TaskExecution:
    db = SessionLocal()
    try:
        dag = db.query(DAG).filter(DAG.id == dag_id).first()
        if not dag:
            raise ValueError(f"DAG {dag_id} not found")

        nodes = db.query(DAGNode).filter(DAGNode.dag_id == dag_id).all()
        edges = db.query(DAGEdge).filter(DAGEdge.dag_id == dag_id).all()

        if not nodes:
            raise ValueError(f"DAG {dag_id} has no nodes")

        execution_order = topological_sort(nodes, edges)

        task_execution = TaskExecution(
            dag_id=dag_id,
            status="running",
            started_at=datetime.now(timezone.utc)
        )
        db.add(task_execution)
        db.flush()

        node_map = {node.id: node for node in nodes}

        node_executions = {}
        for node_id in execution_order:
            node = node_map[node_id]
            ne = NodeExecution(
                task_execution_id=task_execution.id,
                node_id=node_id,
                status="pending"
            )
            db.add(ne)
            db.flush()
            node_executions[node_id] = ne

        db.commit()

        dag_failed = False
        for node_id in execution_order:
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
            except subprocess.TimeoutExpired:
                ne.status = "failed"
                log_output = "Execution timed out after 3600 seconds"
                dag_failed = True
            except Exception as e:
                ne.status = "failed"
                log_output = f"Execution error: {str(e)}"
                dag_failed = True

            ne.log = log_output
            ne.finished_at = datetime.now(timezone.utc)
            db.commit()

            if dag_failed:
                for remaining_node_id in execution_order[execution_order.index(node_id) + 1:]:
                    remaining_ne = node_executions[remaining_node_id]
                    remaining_ne.status = "skipped"
                    remaining_ne.log = "Skipped due to upstream failure"
                    db.commit()
                break

        task_execution.status = "success" if not dag_failed else "failed"
        task_execution.finished_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(task_execution)

        return task_execution
    except Exception as e:
        logger.error(f"Error in execute_dag {dag_id}: {e}", exc_info=True)
        if 'task_execution' in locals():
            task_execution.status = "failed"
            task_execution.finished_at = datetime.now(timezone.utc)
            db.commit()
        raise
    finally:
        db.close()
