import subprocess
import sys
import os
import tempfile
import asyncio
import threading
from datetime import datetime, timezone
from collections import deque, defaultdict
from typing import List, Dict, Set
import logging

from ..database import SessionLocal
from sqlalchemy.orm import Session
from ..models.dag import DAG
from ..models.dag_node import DAGNode
from ..models.dag_edge import DAGEdge
from ..models.task_execution import TaskExecution
from ..models.node_execution import NodeExecution
from ..schemas.execution import LogEntry, StatusUpdate, ExecutionComplete
from ..routers.executions import manager

logger = logging.getLogger(__name__)


def _get_main_loop():
    from ..main import MAIN_EVENT_LOOP
    if MAIN_EVENT_LOOP is None:
        raise RuntimeError("Main event loop is not initialized yet")
    return MAIN_EVENT_LOOP


def _run_async(coro):
    try:
        loop = _get_main_loop()
    except RuntimeError:
        logger.warning("Main event loop not ready, skipping async broadcast")
        return
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    try:
        return future.result(timeout=30)
    except Exception as e:
        logger.warning(f"_run_async failed: {e}")


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
    await manager.broadcast_log(execution_id, log_entry)


async def send_status_update(
    execution_id: int,
    status: str,
    node_id: int | None = None,
    node_name: str | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None
):
    update = StatusUpdate(
        node_id=node_id,
        node_name=node_name,
        status=status,
        started_at=started_at,
        finished_at=finished_at
    )
    await manager.broadcast_status(execution_id, update)


async def send_execution_complete(execution_id: int, status: str, finished_at: datetime):
    complete = ExecutionComplete(
        execution_id=execution_id,
        status=status,
        finished_at=finished_at
    )
    await manager.broadcast_event(execution_id, complete)


def _broadcast_log_sync(execution_id: int, node_id: int, node_name: str, message: str, level: str = "info"):
    try:
        _run_async(send_log(execution_id, node_id, node_name, message, level))
    except Exception as e:
        logger.warning(f"Failed to broadcast log: {e}")


def _broadcast_status_sync(
    execution_id: int,
    status: str,
    node_id: int | None = None,
    node_name: str | None = None,
    started_at=None,
    finished_at=None
):
    try:
        _run_async(send_status_update(execution_id, status, node_id, node_name, started_at, finished_at))
    except Exception as e:
        logger.warning(f"Failed to broadcast status: {e}")


def _broadcast_complete_sync(execution_id: int, status: str, finished_at: datetime):
    try:
        _run_async(send_execution_complete(execution_id, status, finished_at))
    except Exception as e:
        logger.warning(f"Failed to broadcast complete: {e}")


def _run_execution_internal(execution_id: int, init_status: bool = True, skip_node_ids: Set[int] | None = None):
    db = SessionLocal()
    skip_node_ids = skip_node_ids or set()
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

        if init_status:
            task_execution.status = "running"
            task_execution.started_at = datetime.now(timezone.utc)
            task_execution.finished_at = None
            db.commit()

        _broadcast_status_sync(
            execution_id, "running",
            node_id=None, node_name=None,
            started_at=task_execution.started_at,
            finished_at=None
        )

        node_map = {node.id: node for node in nodes}
        node_executions = {
            ne.node_id: ne
            for ne in db.query(NodeExecution).filter(
                NodeExecution.task_execution_id == execution_id
            ).all()
        }

        for node_id in skip_node_ids:
            if node_id in node_executions:
                ne = node_executions[node_id]
                _broadcast_status_sync(
                    execution_id, ne.status, node_id,
                    node_map[node_id].name if node_id in node_map else None,
                    ne.started_at, ne.finished_at
                )
                if ne.log:
                    for line in ne.log.strip().split('\n'):
                        if line.strip():
                            _broadcast_log_sync(
                                execution_id, node_id,
                                node_map[node_id].name if node_id in node_map else str(node_id),
                                line
                            )

        dag_failed = False
        for node_id in execution_order:
            node = node_map[node_id]
            ne = node_executions[node_id]

            if node_id in skip_node_ids:
                continue

            ne.status = "running"
            ne.started_at = datetime.now(timezone.utc)
            ne.finished_at = None
            ne.log = ""
            db.commit()

            _broadcast_status_sync(
                execution_id, "running", node_id, node.name, ne.started_at
            )
            _broadcast_log_sync(execution_id, node_id, node.name, f"▶ 开始执行节点: {node.name}", "info")

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

                for line in (stdout + stderr).strip().split('\n'):
                    if line.strip():
                        _broadcast_log_sync(execution_id, node_id, node.name, line)

                if returncode == 0:
                    ne.status = "success"
                    _broadcast_log_sync(execution_id, node_id, node.name, f"✅ 节点执行成功: {node.name}", "success")
                else:
                    ne.status = "failed"
                    dag_failed = True
                    _broadcast_log_sync(execution_id, node_id, node.name, f"❌ 节点执行失败: {node.name} (退出码: {returncode})", "error")
            except subprocess.TimeoutExpired:
                ne.status = "failed"
                log_output = "Execution timed out after 3600 seconds"
                dag_failed = True
                _broadcast_log_sync(execution_id, node_id, node.name, f"⏱ 节点执行超时: {node.name}", "error")
            except Exception as e:
                ne.status = "failed"
                log_output = f"Execution error: {str(e)}"
                dag_failed = True
                _broadcast_log_sync(execution_id, node_id, node.name, f"⚠ 节点执行异常: {str(e)}", "error")

            ne.log = log_output
            ne.finished_at = datetime.now(timezone.utc)
            db.commit()

            _broadcast_status_sync(
                execution_id, ne.status, node_id, node.name, ne.started_at, ne.finished_at
            )

            if dag_failed:
                remaining_start = execution_order.index(node_id) + 1
                for remaining_node_id in execution_order[remaining_start:]:
                    remaining_ne = node_executions[remaining_node_id]
                    remaining_ne.status = "skipped"
                    remaining_ne.log = "Skipped due to upstream failure"
                    remaining_ne.started_at = None
                    remaining_ne.finished_at = None
                    db.commit()
                    _broadcast_status_sync(
                        execution_id, "skipped", remaining_node_id,
                        node_map[remaining_node_id].name if remaining_node_id in node_map else None
                    )
                break

        final_status = "success" if not dag_failed else "failed"
        task_execution.status = final_status
        task_execution.finished_at = datetime.now(timezone.utc)
        db.commit()

        _broadcast_complete_sync(execution_id, final_status, task_execution.finished_at)
    except Exception as e:
        logger.error(f"Error in run_execution {execution_id}: {e}", exc_info=True)
        if 'task_execution' in locals():
            task_execution.status = "failed"
            task_execution.finished_at = datetime.now(timezone.utc)
            db.commit()
            _broadcast_complete_sync(execution_id, "failed", task_execution.finished_at)
    finally:
        db.close()


def run_execution(execution_id: int):
    _run_execution_internal(execution_id, init_status=True)


def retry_execution(execution_id: int) -> TaskExecution:
    skip_node_ids: Set[int] = set()
    prepare_db = SessionLocal()
    try:
        skip_node_ids = _prepare_retry_internal(prepare_db, execution_id)
    finally:
        prepare_db.close()

    _run_execution_internal(execution_id, init_status=False, skip_node_ids=skip_node_ids)

    result_db = SessionLocal()
    try:
        task_execution = result_db.query(TaskExecution).filter(
            TaskExecution.id == execution_id
        ).first()
        return task_execution
    finally:
        result_db.close()


def prepare_retry(execution_id: int, owner_id: int) -> Set[int]:
    """同步准备重试：校验权限、重置节点、递增retry_count、设为running。
    返回需要跳过的success节点ID集合，供后续后台执行使用。"""
    db = SessionLocal()
    try:
        task_execution = db.query(TaskExecution).filter(
            TaskExecution.id == execution_id
        ).first()
        if not task_execution:
            raise ValueError(f"Execution {execution_id} not found")

        dag = db.query(DAG).filter(DAG.id == task_execution.dag_id).first()
        if not dag:
            raise ValueError(f"DAG {task_execution.dag_id} not found")
        if dag.owner_id != owner_id:
            raise PermissionError(f"Not authorized to retry execution {execution_id}")

        skip_node_ids = _prepare_retry_internal(db, execution_id)
        return skip_node_ids
    except Exception as e:
        logger.error(f"Error in prepare_retry {execution_id}: {e}", exc_info=True)
        raise
    finally:
        db.close()


def _prepare_retry_internal(db: Session, execution_id: int) -> Set[int]:
    """内部准备重试逻辑（已在db会话中）：重置节点、递增retry_count、设置running。
    返回需要跳过的success节点ID集合。"""
    from datetime import datetime, timezone as tz

    task_execution = db.query(TaskExecution).filter(
        TaskExecution.id == execution_id
    ).first()
    if not task_execution:
        raise ValueError(f"Execution {execution_id} not found")

    if task_execution.status == "running":
        raise ValueError(f"Execution {execution_id} is already running")

    dag = db.query(DAG).filter(DAG.id == task_execution.dag_id).first()
    if not dag:
        raise ValueError(f"DAG {task_execution.dag_id} not found")

    nodes = db.query(DAGNode).filter(DAGNode.dag_id == dag.id).all()
    edges = db.query(DAGEdge).filter(DAGEdge.dag_id == dag.id).all()

    if not nodes:
        raise ValueError(f"DAG {dag.id} has no nodes")

    execution_order = topological_sort(nodes, edges)

    node_executions = {
        ne.node_id: ne
        for ne in db.query(NodeExecution).filter(
            NodeExecution.task_execution_id == execution_id
        ).all()
    }

    existing_node_ids = set(node_executions.keys())
    for node_id in execution_order:
        if node_id not in existing_node_ids:
            ne = NodeExecution(
                task_execution_id=task_execution.id,
                node_id=node_id,
                status="pending"
            )
            db.add(ne)
            node_executions[node_id] = ne

    db.commit()

    skip_node_ids: Set[int] = set()
    for node_id in execution_order:
        ne = node_executions[node_id]
        if ne.status == "success":
            skip_node_ids.add(node_id)
        else:
            ne.status = "pending"
            ne.started_at = None
            ne.finished_at = None
            ne.log = ""

    task_execution.status = "running"
    task_execution.retry_count = (task_execution.retry_count or 0) + 1
    task_execution.started_at = datetime.now(tz.utc)
    task_execution.finished_at = None

    db.commit()
    db.refresh(task_execution)
    return skip_node_ids


def run_retry_only(execution_id: int, skip_node_ids: Set[int]):
    """只执行重试的运行阶段（不做准备、不初始化状态），配合prepare_retry使用。"""
    try:
        _run_execution_internal(execution_id, init_status=False, skip_node_ids=skip_node_ids)
    except Exception as e:
        logger.error(f"Error in run_retry_only {execution_id}: {e}", exc_info=True)
        raise


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
            status="pending",
            retry_count=0,
            started_at=datetime.now(timezone.utc)
        )
        db.add(task_execution)
        db.flush()

        for node_id in execution_order:
            ne = NodeExecution(
                task_execution_id=task_execution.id,
                node_id=node_id,
                status="pending"
            )
            db.add(ne)

        db.commit()
        db.refresh(task_execution)
        execution_id = task_execution.id
        db.close()

        run_execution(execution_id)

        db = SessionLocal()
        task_execution = db.query(TaskExecution).filter(
            TaskExecution.id == execution_id
        ).first()
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
