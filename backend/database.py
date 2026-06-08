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
