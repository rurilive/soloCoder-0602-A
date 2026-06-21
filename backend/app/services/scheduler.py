import logging
from typing import Optional
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from croniter import croniter, CroniterBadCronError

from ..database import SessionLocal
from ..models.dag import DAG

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        self.scheduler = BackgroundScheduler(timezone="Asia/Shanghai")
        self._job_prefix = "dag_"
        self._running = False

    def start(self):
        if self._running:
            return
        self.scheduler.start()
        self._running = True
        self._load_active_dags()
        logger.info("Scheduler started")

    def shutdown(self):
        if not self._running:
            return
        self.scheduler.shutdown(wait=True)
        self._running = False
        logger.info("Scheduler shutdown")

    def _load_active_dags(self):
        db = SessionLocal()
        try:
            active_dags = db.query(DAG).filter(DAG.is_active == True).all()
            for dag in active_dags:
                self._add_job(dag.id, dag.cron_expression)
        finally:
            db.close()

    def _add_job(self, dag_id: int, cron_expression: str) -> bool:
        job_id = f"{self._job_prefix}{dag_id}"
        try:
            if not croniter.is_valid(cron_expression):
                logger.error(f"Invalid cron expression: {cron_expression} for DAG {dag_id}")
                return False

            trigger = CronTrigger.from_crontab(cron_expression)

            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)

            self.scheduler.add_job(
                self._execute_dag_job,
                trigger=trigger,
                id=job_id,
                args=[dag_id],
                replace_existing=True
            )
            logger.info(f"Scheduled DAG {dag_id} with cron: {cron_expression}")
            return True
        except CroniterBadCronError as e:
            logger.error(f"Bad cron expression for DAG {dag_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to schedule DAG {dag_id}: {e}")
            return False

    def _execute_dag_job(self, dag_id: int):
        from .executor import execute_dag
        try:
            execute_dag(dag_id)
        except Exception as e:
            logger.error(f"Error executing DAG {dag_id}: {e}")

    def schedule_dag(self, dag_id: int) -> bool:
        db = SessionLocal()
        try:
            dag = db.query(DAG).filter(DAG.id == dag_id).first()
            if not dag:
                logger.error(f"DAG {dag_id} not found")
                return False
            return self._add_job(dag_id, dag.cron_expression)
        finally:
            db.close()

    def remove_dag(self, dag_id: int):
        job_id = f"{self._job_prefix}{dag_id}"
        if self.scheduler.get_job(job_id):
            self.scheduler.remove_job(job_id)
            logger.info(f"Removed schedule for DAG {dag_id}")

    def update_dag(self, dag_id: int, cron_expression: Optional[str] = None):
        db = SessionLocal()
        try:
            dag = db.query(DAG).filter(DAG.id == dag_id).first()
            if not dag:
                return
            if cron_expression:
                dag.cron_expression = cron_expression
            if dag.is_active:
                self._add_job(dag_id, dag.cron_expression)
            else:
                self.remove_dag(dag_id)
        finally:
            db.close()


scheduler_service = SchedulerService()
