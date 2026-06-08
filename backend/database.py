import sqlite3
import os
import threading
from typing import List, Dict, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "metrics.db")

FLUSH_INTERVAL = 10
FLUSH_THRESHOLD = 50


class MetricsDB:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._conn = None
                cls._instance._buffer = []
                cls._instance._buffer_lock = threading.Lock()
                cls._instance._conn_lock = threading.Lock()
            return cls._instance

    def _get_conn(self) -> sqlite3.Connection:
        with self._conn_lock:
            if self._conn is None:
                self._conn = sqlite3.connect(DB_PATH, check_same_thread=False)
                self._conn.row_factory = sqlite3.Row
            return self._conn

    def init_db(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                cpu_usage REAL NOT NULL,
                memory_usage REAL NOT NULL,
                request_count REAL NOT NULL,
                response_time REAL NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                metric TEXT NOT NULL,
                value REAL NOT NULL,
                threshold_type TEXT NOT NULL,
                threshold_value REAL NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_alerts_timestamp ON alerts(timestamp)
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_alerts_metric ON alerts(metric)
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged)
            """
        )
        conn.commit()

    def insert_metric(self, metrics: Dict):
        with self._buffer_lock:
            self._buffer.append((
                metrics["timestamp"],
                metrics["cpu_usage"],
                metrics["memory_usage"],
                metrics["request_count"],
                metrics["response_time"],
            ))
            if len(self._buffer) >= FLUSH_THRESHOLD:
                self._flush_unlocked()

    def flush(self):
        with self._buffer_lock:
            self._flush_unlocked()

    def _flush_unlocked(self):
        if not self._buffer:
            return
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.executemany(
            """
            INSERT INTO metrics (timestamp, cpu_usage, memory_usage, request_count, response_time)
            VALUES (?, ?, ?, ?, ?)
            """,
            self._buffer,
        )
        conn.commit()
        self._buffer = []

    def query_metrics(
        self,
        start_time: float,
        end_time: float,
        downsample: Optional[str] = None,
        max_points: int = 1000,
    ) -> List[Dict]:
        with self._buffer_lock:
            self._flush_unlocked()
        conn = self._get_conn()
        cursor = conn.cursor()

        if downsample:
            interval_seconds = _parse_interval(downsample)
            if interval_seconds > 0:
                cursor.execute(
                    """
                    SELECT
                        (CAST(timestamp AS INTEGER) / ?) * ? AS bucket_time,
                        AVG(cpu_usage) AS cpu_usage,
                        AVG(memory_usage) AS memory_usage,
                        AVG(request_count) AS request_count,
                        AVG(response_time) AS response_time,
                        COUNT(*) AS sample_count
                    FROM metrics
                    WHERE timestamp >= ? AND timestamp <= ?
                    GROUP BY bucket_time
                    ORDER BY bucket_time
                    """,
                    (interval_seconds, interval_seconds, start_time, end_time),
                )
                rows = cursor.fetchall()
                return [
                    {
                        "timestamp": row["bucket_time"],
                        "cpu_usage": row["cpu_usage"],
                        "memory_usage": row["memory_usage"],
                        "request_count": row["request_count"],
                        "response_time": row["response_time"],
                    }
                    for row in rows
                ]

        cursor.execute(
            """
            SELECT timestamp, cpu_usage, memory_usage, request_count, response_time
            FROM metrics
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp
            LIMIT ?
            """,
            (start_time, end_time, max_points),
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def insert_alert(self, alert: Dict):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO alerts (timestamp, metric, value, threshold_type, threshold_value, acknowledged)
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (
                alert["timestamp"],
                alert["metric"],
                alert["value"],
                alert["threshold_type"],
                alert["threshold_value"],
            ),
        )
        conn.commit()

    def query_alerts(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        metric: Optional[str] = None,
        acknowledged: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        conditions = []
        params = []
        if start_time is not None:
            conditions.append("timestamp >= ?")
            params.append(start_time)
        if end_time is not None:
            conditions.append("timestamp <= ?")
            params.append(end_time)
        if metric is not None:
            conditions.append("metric = ?")
            params.append(metric)
        if acknowledged is not None:
            conditions.append("acknowledged = ?")
            params.append(acknowledged)
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT id, timestamp, metric, value, threshold_type, threshold_value, acknowledged
            FROM alerts
            {where_clause}
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
            """,
            params + [limit, offset],
        )
        rows = cursor.fetchall()
        count_cursor = conn.cursor()
        count_cursor.execute(
            f"""
            SELECT COUNT(*) AS total FROM alerts {where_clause}
            """,
            params,
        )
        total = count_cursor.fetchone()["total"]
        return {
            "total": total,
            "data": [dict(row) for row in rows],
        }

    def acknowledge_alert(self, alert_id: int):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE alerts SET acknowledged = 1 WHERE id = ?",
            (alert_id,),
        )
        conn.commit()
        return cursor.rowcount > 0

    def acknowledge_all_alerts(self):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("UPDATE alerts SET acknowledged = 1 WHERE acknowledged = 0")
        conn.commit()
        return cursor.rowcount

    def delete_alerts(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ):
        conn = self._get_conn()
        cursor = conn.cursor()
        conditions = []
        params = []
        if start_time is not None:
            conditions.append("timestamp >= ?")
            params.append(start_time)
        if end_time is not None:
            conditions.append("timestamp <= ?")
            params.append(end_time)
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        cursor.execute(f"DELETE FROM alerts {where_clause}", params)
        conn.commit()
        return cursor.rowcount

    def get_alert_stats(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> Dict:
        conn = self._get_conn()
        cursor = conn.cursor()
        conditions = []
        params = []
        if start_time is not None:
            conditions.append("timestamp >= ?")
            params.append(start_time)
        if end_time is not None:
            conditions.append("timestamp <= ?")
            params.append(end_time)
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT
                COUNT(*) AS total_count,
                SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) AS unacknowledged_count,
                SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) AS acknowledged_count
            FROM alerts
            {where_clause}
            """,
            params,
        )
        overview = dict(cursor.fetchone())
        cursor.execute(
            f"""
            SELECT
                metric,
                COUNT(*) AS count,
                SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) AS unacknowledged
            FROM alerts
            {where_clause}
            GROUP BY metric
            ORDER BY count DESC
            """,
            params,
        )
        by_metric = [dict(row) for row in cursor.fetchall()]
        cursor.execute(
            f"""
            SELECT
                threshold_type,
                COUNT(*) AS count
            FROM alerts
            {where_clause}
            GROUP BY threshold_type
            """,
            params,
        )
        by_type = [dict(row) for row in cursor.fetchall()]
        return {
            "overview": overview,
            "by_metric": by_metric,
            "by_type": by_type,
        }

    def get_metrics_stats(
        self,
        start_time: float,
        end_time: float,
    ) -> Dict:
        with self._buffer_lock:
            self._flush_unlocked()
        conn = self._get_conn()
        cursor = conn.cursor()
        metric_keys = ["cpu_usage", "memory_usage", "request_count", "response_time"]
        stats = {}
        for key in metric_keys:
            cursor.execute(
                f"""
                SELECT
                    AVG({key}) AS avg,
                    MIN({key}) AS min,
                    MAX({key}) AS max,
                    COUNT(*) AS count
                FROM metrics
                WHERE timestamp >= ? AND timestamp <= ?
                """,
                (start_time, end_time),
            )
            row = cursor.fetchone()
            base = dict(row)
            cursor.execute(
                f"""
                SELECT {key} AS p95 FROM metrics
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY {key}
                LIMIT 1 OFFSET (SELECT COUNT(*) FROM metrics WHERE timestamp >= ? AND timestamp <= ?) * 95 / 100 - 1
                """,
                (start_time, end_time, start_time, end_time),
            )
            p95_row = cursor.fetchone()
            base["p95"] = p95_row[key] if p95_row else None
            cursor.execute(
                f"""
                SELECT {key} AS p99 FROM metrics
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY {key}
                LIMIT 1 OFFSET (SELECT COUNT(*) FROM metrics WHERE timestamp >= ? AND timestamp <= ?) * 99 / 100 - 1
                """,
                (start_time, end_time, start_time, end_time),
            )
            p99_row = cursor.fetchone()
            base["p99"] = p99_row[key] if p99_row else None
            for k in ("avg", "min", "max", "p95", "p99"):
                if base[k] is not None:
                    base[k] = round(base[k], 2)
            stats[key] = base
        return stats

    def close(self):
        self.flush()
        with self._conn_lock:
            if self._conn is not None:
                self._conn.close()
                self._conn = None


def _parse_interval(interval: str) -> int:
    units = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    if len(interval) < 2:
        return 0
    unit = interval[-1].lower()
    try:
        value = int(interval[:-1])
        return value * units.get(unit, 0)
    except ValueError:
        return 0


db = MetricsDB()
