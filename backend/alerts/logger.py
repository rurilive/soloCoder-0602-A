import logging
import os
from datetime import datetime

LOG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ALERT_LOG_FILE = os.path.join(LOG_DIR, "alerts.log")


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

    def log_alert(self, metric: str, value: float, threshold_type: str, threshold_value: float):
        msg = f"ALERT: {metric}={value:.2f} {threshold_type} threshold={threshold_value:.2f}"
        self.logger.warning(msg)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

    def _compute_severity(self, value: float, threshold_value: float, threshold_type: str) -> str:
        if threshold_type == "max":
            breach = max(0.0, value - threshold_value)
        else:
            breach = max(0.0, threshold_value - value)
        if breach <= 0:
            return "warning"
        baseline = max(abs(threshold_value), 1.0)
        deviation = breach / baseline
        return "critical" if deviation >= 0.2 else "warning"

    def check_thresholds(self, metrics: dict, thresholds: dict) -> list:
        alerts = []
        for metric_key, value in metrics.items():
            if metric_key == "timestamp":
                continue
            min_key = f"{metric_key}_min"
            max_key = f"{metric_key}_max"

            if max_key in thresholds and thresholds[max_key] is not None:
                if value > thresholds[max_key]:
                    severity = self._compute_severity(value, thresholds[max_key], "max")
                    alerts.append({
                        "metric": metric_key,
                        "value": value,
                        "threshold_type": "max",
                        "threshold_value": thresholds[max_key],
                        "timestamp": metrics["timestamp"],
                        "severity": severity,
                    })
                    self.log_alert(metric_key, value, "exceeds max", thresholds[max_key])

            if min_key in thresholds and thresholds[min_key] is not None:
                if value < thresholds[min_key]:
                    severity = self._compute_severity(value, thresholds[min_key], "min")
                    alerts.append({
                        "metric": metric_key,
                        "value": value,
                        "threshold_type": "min",
                        "threshold_value": thresholds[min_key],
                        "timestamp": metrics["timestamp"],
                        "severity": severity,
                    })
                    self.log_alert(metric_key, value, "below min", thresholds[min_key])

        return alerts
