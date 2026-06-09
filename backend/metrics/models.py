from pydantic import BaseModel, Field
from typing import Dict, Optional, List, Any


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
    severity: str = "warning"
    rule_id: Optional[int] = None
    rule_name: Optional[str] = None
    suppressed: int = 0


class SilenceWindow(BaseModel):
    start: str = Field(..., description="静默开始时间 HH:MM，24h制")
    end: str = Field(..., description="静默结束时间 HH:MM，24h制，可早于start表示跨午夜")


class AlertRuleCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    enabled: Optional[bool] = True
    severity: Optional[str] = "warning"
    condition: Dict[str, Any]
    silence_windows: Optional[List[SilenceWindow]] = None


class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    severity: Optional[str] = None
    condition: Optional[Dict[str, Any]] = None
    silence_windows: Optional[List[SilenceWindow]] = None
