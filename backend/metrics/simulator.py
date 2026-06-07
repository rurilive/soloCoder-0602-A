import random
import time


class BusinessMetricsSimulator:
    def __init__(self):
        self.base_requests = 100
        self.base_response_time = 50

    def get_request_count(self) -> float:
        variation = random.uniform(-30, 50)
        trend = random.uniform(-2, 2)
        self.base_requests = max(10, min(500, self.base_requests + trend))
        return max(0, self.base_requests + variation)

    def get_response_time(self) -> float:
        base = self.base_response_time + random.uniform(-20, 80)
        spike_chance = random.random()
        if spike_chance < 0.05:
            base += random.uniform(200, 500)
        return max(10, base)

    def simulate(self) -> dict:
        return {
            "request_count": self.get_request_count(),
            "response_time": self.get_response_time(),
            "timestamp": time.time(),
        }
