import psutil
import time


class SystemMetricsCollector:
    def __init__(self):
        pass

    def get_cpu_usage(self) -> float:
        return psutil.cpu_percent(interval=0.1)

    def get_memory_usage(self) -> float:
        mem = psutil.virtual_memory()
        return mem.percent

    def collect(self) -> dict:
        return {
            "cpu_usage": self.get_cpu_usage(),
            "memory_usage": self.get_memory_usage(),
            "timestamp": time.time(),
        }
