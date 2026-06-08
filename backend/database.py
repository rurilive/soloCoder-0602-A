import sqlite3
import os
from contextlib import contextmanager
from typing import List, Dict, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "metrics.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
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
    conn.close()


def insert_metric(metrics: Dict):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO metrics (timestamp, cpu_usage, memory_usage, request_count, response_time)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            metrics["timestamp"],
            metrics["cpu_usage"],
            metrics["memory_usage"],
            metrics["request_count"],
            metrics["response_time"],
        ),
    )
    conn.commit()
    conn.close()


def query_metrics(
    start_time: float,
    end_time: float,
    downsample: Optional[str] = None,
    max_points: int = 1000,
) -> List[Dict]:
    conn = get_db()
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
            result = [
                {
                    "timestamp": row["bucket_time"],
                    "cpu_usage": row["cpu_usage"],
                    "memory_usage": row["memory_usage"],
                    "request_count": row["request_count"],
                    "response_time": row["response_time"],
                }
                for row in rows
            ]
            conn.close()
            return result

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
    result = [dict(row) for row in rows]
    conn.close()
    return result


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


init_db()
