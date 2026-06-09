import sqlite3
import os
import json
import threading
from typing import List, Dict, Optional, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "metrics.db")

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
                os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
                self._conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=10)
                self._conn.row_factory = sqlite3.Row
                self._conn.execute("PRAGMA journal_mode=WAL")
                self._conn.execute("PRAGMA busy_timeout=5000")
            return self._conn

    def _migrate_alerts_table(self, cursor):
        columns = [row[1] for row in cursor.execute("PRAGMA table_info(alerts)").fetchall()]
        if "severity" not in columns:
            cursor.execute("ALTER TABLE alerts ADD COLUMN severity TEXT DEFAULT 'warning'")
        if "rule_id" not in columns:
            cursor.execute("ALTER TABLE alerts ADD COLUMN rule_id INTEGER")
        if "suppressed" not in columns:
            cursor.execute("ALTER TABLE alerts ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0")
        if "rule_name" not in columns:
            cursor.execute("ALTER TABLE alerts ADD COLUMN rule_name TEXT")

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
                acknowledged INTEGER NOT NULL DEFAULT 0,
                severity TEXT DEFAULT 'warning',
                rule_id INTEGER,
                suppressed INTEGER NOT NULL DEFAULT 0,
                rule_name TEXT
            )
            """
        )
        self._migrate_alerts_table(cursor)
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
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS alert_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                severity TEXT NOT NULL DEFAULT 'warning',
                condition_json TEXT NOT NULL,
                silence_windows_json TEXT,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled)
            """
        )
        conn.commit()
        self._seed_default_rules()

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

    def _seed_default_rules(self):
        cursor = self._get_conn().cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM alert_rules")
        if cursor.fetchone()["cnt"] > 0:
            return
        now = __import__("time").time()
        default_rules = [
            {
                "name": "CPU高负载",
                "description": "CPU使用率超过阈值",
                "severity": "warning",
                "condition_json": json.dumps({
                    "op": "gt",
                    "metric": "cpu_usage",
                    "value": 80,
                }),
            },
            {
                "name": "内存紧张",
                "description": "内存使用率超过阈值",
                "severity": "warning",
                "condition_json": json.dumps({
                    "op": "gt",
                    "metric": "memory_usage",
                    "value": 85,
                }),
            },
            {
                "name": "响应缓慢",
                "description": "响应时间超过阈值",
                "severity": "warning",
                "condition_json": json.dumps({
                    "op": "gt",
                    "metric": "response_time",
                    "value": 200,
                }),
            },
            {
                "name": "系统严重过载",
                "description": "CPU和内存同时超过高阈值（AND组合）",
                "severity": "critical",
                "condition_json": json.dumps({
                    "op": "and",
                    "conditions": [
                        {"op": "gt", "metric": "cpu_usage", "value": 90},
                        {"op": "gt", "metric": "memory_usage", "value": 90},
                    ],
                }),
            },
            {
                "name": "服务异常",
                "description": "响应时间过长或请求数异常低（OR组合）",
                "severity": "critical",
                "condition_json": json.dumps({
                    "op": "or",
                    "conditions": [
                        {"op": "gt", "metric": "response_time", "value": 500},
                        {"op": "lt", "metric": "request_count", "value": 5},
                    ],
                }),
            },
        ]
        for rule in default_rules:
            cursor.execute(
                """
                INSERT INTO alert_rules (name, description, enabled, severity, condition_json, silence_windows_json, created_at, updated_at)
                VALUES (?, ?, 1, ?, ?, NULL, ?, ?)
                """,
                (rule["name"], rule["description"], rule["severity"], rule["condition_json"], now, now),
            )
        self._get_conn().commit()

    def insert_alert(self, alert: Dict):
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO alerts (timestamp, metric, value, threshold_type, threshold_value, acknowledged, severity, rule_id, suppressed, rule_name)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
            """,
            (
                alert["timestamp"],
                alert.get("metric", "composite"),
                alert.get("value", 0),
                alert.get("threshold_type", "rule"),
                alert.get("threshold_value", 0),
                alert.get("severity", "warning"),
                alert.get("rule_id"),
                alert.get("suppressed", 0),
                alert.get("rule_name"),
            ),
        )
        conn.commit()

    def list_alert_rules(self, enabled_only: bool = False) -> List[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        if enabled_only:
            cursor.execute("SELECT * FROM alert_rules WHERE enabled = 1 ORDER BY id")
        else:
            cursor.execute("SELECT * FROM alert_rules ORDER BY id")
        rows = cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["condition"] = json.loads(d["condition_json"]) if d["condition_json"] else None
            d["silence_windows"] = json.loads(d["silence_windows_json"]) if d["silence_windows_json"] else []
            del d["condition_json"]
            del d["silence_windows_json"]
            result.append(d)
        return result

    def get_alert_rule(self, rule_id: int) -> Optional[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM alert_rules WHERE id = ?", (rule_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["condition"] = json.loads(d["condition_json"]) if d["condition_json"] else None
        d["silence_windows"] = json.loads(d["silence_windows_json"]) if d["silence_windows_json"] else []
        del d["condition_json"]
        del d["silence_windows_json"]
        return d

    def create_alert_rule(self, rule: Dict) -> int:
        import time as _time
        now = _time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO alert_rules (name, description, enabled, severity, condition_json, silence_windows_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rule["name"],
                rule.get("description", ""),
                1 if rule.get("enabled", True) else 0,
                rule.get("severity", "warning"),
                json.dumps(rule["condition"]),
                json.dumps(rule.get("silence_windows", [])) if rule.get("silence_windows") else None,
                now,
                now,
            ),
        )
        conn.commit()
        return cursor.lastrowid

    def update_alert_rule(self, rule_id: int, rule: Dict) -> bool:
        import time as _time
        now = _time.time()
        conn = self._get_conn()
        cursor = conn.cursor()
        fields = ["updated_at = ?"]
        params = [now]
        if "name" in rule:
            fields.append("name = ?")
            params.append(rule["name"])
        if "description" in rule:
            fields.append("description = ?")
            params.append(rule["description"])
        if "enabled" in rule:
            fields.append("enabled = ?")
            params.append(1 if rule["enabled"] else 0)
        if "severity" in rule:
            fields.append("severity = ?")
            params.append(rule["severity"])
        if "condition" in rule:
            fields.append("condition_json = ?")
            params.append(json.dumps(rule["condition"]))
        if "silence_windows" in rule:
            fields.append("silence_windows_json = ?")
            params.append(json.dumps(rule["silence_windows"]) if rule["silence_windows"] else None)
        params.append(rule_id)
        cursor.execute(f"UPDATE alert_rules SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        return cursor.rowcount > 0

    def delete_alert_rule(self, rule_id: int) -> bool:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM alert_rules WHERE id = ?", (rule_id,))
        conn.commit()
        return cursor.rowcount > 0

    def query_alerts(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        metric: Optional[str] = None,
        acknowledged: Optional[int] = None,
        severity: Optional[str] = None,
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
        if severity is not None:
            conditions.append("severity = ?")
            params.append(severity)
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        cursor.execute(
            f"""
            SELECT id, timestamp, metric, value, threshold_type, threshold_value, acknowledged, severity, rule_id, suppressed, rule_name
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
        cursor.execute(
            f"""
            SELECT
                severity,
                COUNT(*) AS count,
                SUM(CASE WHEN acknowledged = 0 THEN 1 ELSE 0 END) AS unacknowledged
            FROM alerts
            {where_clause}
            GROUP BY severity
            """,
            params,
        )
        by_severity = [dict(row) for row in cursor.fetchall()]
        return {
            "overview": overview,
            "by_metric": by_metric,
            "by_type": by_type,
            "by_severity": by_severity,
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
