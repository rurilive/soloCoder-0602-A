from pydantic import BaseModel
from typing import Dict, Optional


class MetricsData(BaseModel):
    timestamp: float
    cpu_usage: float
    memory_usage: float
    request_count: float
    response_time: float


class ThresholdConfig(BaseModel):
    cpu_usage_min: Optional[float] = None
    cpu_usage_max: Optional[float] = None
    memory_usage_min: Optional[float] = None
    memory_usage_max: Optional[float] = None
    request_count_min: Optional[float] = None
    request_count_max: Optional[float] = None
    response_time_min: Optional[float] = None
    response_time_max: Optional[float] = None


class AlertMessage(BaseModel):
    metric: str
    value: float
    threshold_type: str
    threshold_value: float
    timestamp: float
