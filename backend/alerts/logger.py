import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple

LOG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALERT_LOG_FILE = os.path.join(LOG_DIR, "alerts.log")

SUPPORTED_OPS = {"gt", "lt", "gte", "lte", "eq", "neq", "and", "or"}


class RuleEvaluationError(Exception):
    pass


class AlertLogger:
    def __init__(self, log_file: str = ALERT_LOG_FILE):
        self.log_file = log_file
        self.logger = logging.getLogger("alerts")
        self.logger.setLevel(logging.INFO)

        if not self.logger.handlers:
            handler = logging.FileHandler(self.log_file)
            formatter = logging.Formatter(
                "%(asctime)s | %(levelname)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S"
            )
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)

    # ====== 日志 ======
    def log_alert(self, msg: str, level: str = "warning"):
        if level == "critical":
            self.logger.critical(msg)
        else:
            self.logger.warning(msg)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

    # ====== 静默时段判断 ======
    def is_in_silence_window(
        self,
        silence_windows: Optional[List[Dict]],
        timestamp: Optional[float] = None,
    ) -> bool:
        """
        判断给定时间戳是否落在任一静默窗口内。
        silence_windows 格式: [{"start": "HH:MM", "end": "HH:MM"}, ...]
        如果 end < start，表示跨午夜，例如 {"start": "22:00", "end": "06:00"}
        """
        if not silence_windows:
            return False
        dt = datetime.fromtimestamp(timestamp) if timestamp else datetime.now()
        now_minutes = dt.hour * 60 + dt.minute
        for win in silence_windows:
            try:
                s = self._parse_hhmm(win.get("start", ""))
                e = self._parse_hhmm(win.get("end", ""))
            except (ValueError, TypeError):
                continue
            if s is None or e is None:
                continue
            if s <= e:
                if s <= now_minutes <= e:
                    return True
            else:
                if now_minutes >= s or now_minutes <= e:
                    return True
        return False

    @staticmethod
    def _parse_hhmm(s: str) -> Optional[int]:
        if not isinstance(s, str) or ":" not in s:
            return None
        parts = s.split(":")
        if len(parts) != 2:
            return None
        try:
            h = int(parts[0])
            m = int(parts[1])
            if not (0 <= h <= 23 and 0 <= m <= 59):
                return None
            return h * 60 + m
        except ValueError:
            return None

    # ====== 复合条件规则评估引擎 ======
    def evaluate_condition(self, condition: Dict, metrics: Dict) -> Tuple[bool, Optional[float], Optional[str]]:
        """
        评估单个条件节点。
        返回: (是否触发, 触发时的关键值, 关键指标名)
        对于组合节点，如果触发，返回第一个命中的叶子的值/指标用于展示。
        """
        if not isinstance(condition, dict):
            raise RuleEvaluationError("Condition must be a dict")
        op = condition.get("op")
        if op not in SUPPORTED_OPS:
            raise RuleEvaluationError(f"Unsupported op: {op}")

        if op in ("and", "or"):
            sub_conditions = condition.get("conditions", [])
            if not isinstance(sub_conditions, list) or len(sub_conditions) == 0:
                raise RuleEvaluationError(f"{op} requires non-empty 'conditions' list")
            results = []
            for sub in sub_conditions:
                hit, val, met = self.evaluate_condition(sub, metrics)
                results.append((hit, val, met, sub))
            if op == "and":
                all_hit = all(r[0] for r in results)
                if all_hit:
                    # 返回偏离度最大的那个叶子
                    worst = max(results, key=lambda r: self._deviation_score(r[3], r[1]))
                    return True, worst[1], worst[2]
                return False, None, None
            else:  # or
                hit_any = [r for r in results if r[0]]
                if hit_any:
                    worst = max(hit_any, key=lambda r: self._deviation_score(r[3], r[1]))
                    return True, worst[1], worst[2]
                return False, None, None

        # 叶子节点
        metric = condition.get("metric")
        threshold = condition.get("value")
        if metric is None or threshold is None:
            raise RuleEvaluationError("Leaf condition requires 'metric' and 'value'")
        if metric not in metrics:
            return False, None, None
        value = metrics[metric]
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return False, None, None

        hit = False
        if op == "gt":
            hit = value > threshold
        elif op == "lt":
            hit = value < threshold
        elif op == "gte":
            hit = value >= threshold
        elif op == "lte":
            hit = value <= threshold
        elif op == "eq":
            hit = value == threshold
        elif op == "neq":
            hit = value != threshold

        if hit:
            return True, float(value), metric
        return False, None, None

    def _deviation_score(self, condition: Dict, value: Optional[float]) -> float:
        """粗略计算偏离度，用于在多个命中项中选出最严重的那个展示。"""
        if value is None:
            return 0.0
        threshold = condition.get("value")
        if not isinstance(threshold, (int, float)) or threshold == 0:
            return abs(value)
        op = condition.get("op")
        if op in ("gt", "gte"):
            breach = max(0.0, value - threshold)
        elif op in ("lt", "lte"):
            breach = max(0.0, threshold - value)
        else:
            breach = abs(value - threshold)
        baseline = max(abs(threshold), 1.0)
        return breach / baseline

    def _leaf_threshold_type(self, condition: Dict) -> str:
        """从叶子节点推断 threshold_type 展示标签。"""
        op = condition.get("op")
        mapping = {
            "gt": "max", "gte": "max",
            "lt": "min", "lte": "min",
            "eq": "eq", "neq": "neq",
            "and": "composite", "or": "composite",
        }
        return mapping.get(op, "rule")

    def _find_first_leaf(self, condition: Dict) -> Optional[Dict]:
        if not isinstance(condition, dict):
            return None
        op = condition.get("op")
        if op in ("and", "or"):
            for sub in condition.get("conditions", []):
                leaf = self._find_first_leaf(sub)
                if leaf:
                    return leaf
            return None
        return condition

    # ====== 兼容旧接口：单指标严重度估算 ======
    def _compute_severity(self, value: float, threshold_value: float, threshold_type: str) -> str:
        if threshold_type in ("max", "gt", "gte"):
            breach = max(0.0, value - threshold_value)
        else:
            breach = max(0.0, threshold_value - value)
        if breach <= 0:
            return "warning"
        baseline = max(abs(threshold_value), 1.0)
        deviation = breach / baseline
        return "critical" if deviation >= 0.2 else "warning"

    # ====== 主入口：遍历规则列表评估 ======
    def check_rules(self, metrics: Dict, rules: List[Dict]) -> List[Dict]:
        """
        评估所有启用的规则。
        返回: 告警列表，每条告警包含 suppressed 字段（静默期标识）。
        所有告警（无论是否静默）都应入库，但只有 suppressed=0 的才会触发前端通知弹窗。
        """
        alerts = []
        ts = metrics.get("timestamp") or datetime.now().timestamp()
        for rule in rules:
            if not rule.get("enabled", True):
                continue
            rule_id = rule.get("id")
            rule_name = rule.get("name", f"rule_{rule_id}")
            rule_severity = rule.get("severity", "warning")
            condition = rule.get("condition")
            silence_windows = rule.get("silence_windows") or []

            if not condition:
                continue

            try:
                hit, hit_value, hit_metric = self.evaluate_condition(condition, metrics)
            except RuleEvaluationError as e:
                self.log_alert(f"Rule [{rule_name}] evaluation error: {e}", level="warning")
                continue
            except Exception as e:
                self.log_alert(f"Rule [{rule_name}] unexpected error: {e}", level="warning")
                continue

            if not hit:
                continue

            # 找一个叶子节点作为展示参考
            leaf = self._find_first_leaf(condition) or {}
            threshold_type = self._leaf_threshold_type(condition)
            threshold_value = leaf.get("value", 0)
            display_metric = hit_metric or leaf.get("metric") or "composite"
            display_value = hit_value if hit_value is not None else metrics.get(display_metric, 0)

            # 判断是否在静默期
            suppressed = 1 if self.is_in_silence_window(silence_windows, ts) else 0

            # 若规则未指定具体 severity，则根据偏离度动态计算
            severity = rule_severity
            if severity not in ("warning", "critical", "info", "error"):
                severity = self._compute_severity(
                    display_value,
                    threshold_value if isinstance(threshold_value, (int, float)) else 0,
                    threshold_type,
                )

            alert = {
                "metric": display_metric,
                "value": display_value,
                "threshold_type": threshold_type,
                "threshold_value": threshold_value if isinstance(threshold_value, (int, float)) else 0,
                "timestamp": ts,
                "severity": severity,
                "rule_id": rule_id,
                "rule_name": rule_name,
                "suppressed": suppressed,
                "condition_preview": self._summarize_condition(condition),
            }
            alerts.append(alert)

            level = "critical" if severity == "critical" else "warning"
            tag = "[SILENCED] " if suppressed else ""
            self.log_alert(
                f"{tag}ALERT rule=[{rule_name}] metric={display_metric}={display_value:.2f} "
                f"threshold={threshold_value} severity={severity}",
                level=level,
            )
        return alerts

    def _summarize_condition(self, condition: Dict) -> str:
        """将条件树转为简短可读描述，用于日志/展示。"""
        if not isinstance(condition, dict):
            return str(condition)
        op = condition.get("op")
        if op in ("and", "or"):
            subs = [self._summarize_condition(c) for c in condition.get("conditions", [])]
            joiner = " && " if op == "and" else " || "
            return f"({joiner.join(subs)})"
        metric = condition.get("metric", "?")
        value = condition.get("value", "?")
        symbol = {
            "gt": ">", "lt": "<", "gte": ">=", "lte": "<=",
            "eq": "==", "neq": "!=",
        }.get(op, op or "?")
        return f"{metric}{symbol}{value}"

    # ====== 兼容旧接口（硬编码单指标阈值比较）：委托给新引擎 ======
    def check_thresholds(self, metrics: dict, thresholds: dict) -> list:
        """
        兼容旧版 API：将 {metric_max, metric_min} 扁平阈值映射为临时规则列表，
        然后调用新引擎评估。
        """
        rules = []
        for key, value in thresholds.items():
            if value is None:
                continue
            if key.endswith("_max"):
                metric = key[:-4]
                rules.append({
                    "id": None,
                    "name": f"{metric}_max",
                    "enabled": True,
                    "severity": "warning",
                    "condition": {"op": "gt", "metric": metric, "value": value},
                    "silence_windows": [],
                })
            elif key.endswith("_min"):
                metric = key[:-4]
                rules.append({
                    "id": None,
                    "name": f"{metric}_min",
                    "enabled": True,
                    "severity": "warning",
                    "condition": {"op": "lt", "metric": metric, "value": value},
                    "silence_windows": [],
                })
        return self.check_rules(metrics, rules)
