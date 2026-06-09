import asyncio
import time
import csv
import io
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Optional

from config import HOST, PORT, PUSH_INTERVAL
from metrics.collector import SystemMetricsCollector
from metrics.simulator import BusinessMetricsSimulator
from metrics.models import (
    MetricsData,
    ThresholdConfig,
    AlertRuleCreate,
    AlertRuleUpdate,
)
from websocket.manager import ConnectionManager
from alerts.logger import AlertLogger
from database import db


collector = SystemMetricsCollector()
simulator = BusinessMetricsSimulator()
manager = ConnectionManager()
alert_logger = AlertLogger()
current_thresholds = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    push_task = asyncio.create_task(push_metrics())
    flush_task = asyncio.create_task(periodic_flush())
    yield
    push_task.cancel()
    flush_task.cancel()
    try:
        await asyncio.gather(push_task, flush_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass
    db.close()


app = FastAPI(title="Real-time Monitor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def push_metrics():
    while True:
        try:
            sys_metrics = collector.collect()
            biz_metrics = simulator.simulate()

            metrics = {
                "timestamp": time.time(),
                "cpu_usage": sys_metrics["cpu_usage"],
                "memory_usage": sys_metrics["memory_usage"],
                "request_count": biz_metrics["request_count"],
                "response_time": biz_metrics["response_time"],
            }

            alerts = []
            try:
                rules = db.list_alert_rules(enabled_only=True)
            except Exception as e:
                print(f"Error loading alert rules: {e}")
                rules = []

            if rules:
                alerts = alert_logger.check_rules(metrics, rules)
            elif current_thresholds:
                alerts = alert_logger.check_thresholds(metrics, current_thresholds)

            db.insert_metric(metrics)

            for alert in alerts:
                db.insert_alert(alert)

            message = {
                "type": "metrics",
                "data": metrics,
                "alerts": alerts,
            }
            await manager.broadcast(message)

            for alert in alerts:
                if alert.get("suppressed", 0) == 1:
                    continue
                notification = {
                    "type": "alert_notification",
                    "data": {
                        "metric": alert["metric"],
                        "value": alert["value"],
                        "threshold_type": alert["threshold_type"],
                        "threshold_value": alert["threshold_value"],
                        "severity": alert.get("severity", "warning"),
                        "timestamp": alert["timestamp"],
                        "rule_id": alert.get("rule_id"),
                        "rule_name": alert.get("rule_name"),
                    },
                }
                await manager.broadcast(notification)
        except Exception as e:
            print(f"Error pushing metrics: {e}")
        await asyncio.sleep(PUSH_INTERVAL)


async def periodic_flush():
    from database import FLUSH_INTERVAL
    loop = asyncio.get_event_loop()
    while True:
        await asyncio.sleep(FLUSH_INTERVAL)
        try:
            await loop.run_in_executor(None, db.flush)
        except Exception as e:
            print(f"Error flushing metrics: {e}")


@app.get("/metrics")
async def get_metrics():
    sys_metrics = collector.collect()
    biz_metrics = simulator.simulate()
    return {
        "timestamp": time.time(),
        "cpu_usage": sys_metrics["cpu_usage"],
        "memory_usage": sys_metrics["memory_usage"],
        "request_count": biz_metrics["request_count"],
        "response_time": biz_metrics["response_time"],
    }


@app.post("/thresholds")
async def set_thresholds(config: ThresholdConfig):
    global current_thresholds
    current_thresholds = config.model_dump(exclude_none=True)
    return {"status": "ok", "thresholds": current_thresholds}


@app.get("/thresholds")
async def get_thresholds():
    return current_thresholds


@app.get("/metrics/history")
async def get_metrics_history(
    start_time: float = Query(..., description="开始时间戳 (Unix 秒)"),
    end_time: float = Query(..., description="结束时间戳 (Unix 秒)"),
    downsample: Optional[str] = Query(None, description="降采样间隔，如 1m, 5m, 1h, 1d"),
    max_points: int = Query(1000, description="最大返回数据点数"),
):
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time 必须小于 end_time")
    data = db.query_metrics(start_time, end_time, downsample, max_points)
    return {
        "start_time": start_time,
        "end_time": end_time,
        "downsample": downsample,
        "count": len(data),
        "data": data,
    }


@app.get("/metrics/export")
async def export_metrics_csv(
    start_time: float = Query(..., description="开始时间戳 (Unix 秒)"),
    end_time: float = Query(..., description="结束时间戳 (Unix 秒)"),
):
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time 必须小于 end_time")
    data = db.query_metrics(start_time, end_time, None, 100000)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "datetime", "cpu_usage", "memory_usage", "request_count", "response_time"])
    for row in data:
        dt = datetime.fromtimestamp(row["timestamp"]).strftime("%Y-%m-%d %H:%M:%S")
        writer.writerow([
            row["timestamp"],
            dt,
            row["cpu_usage"],
            row["memory_usage"],
            row["request_count"],
            row["response_time"],
        ])

    output.seek(0)
    filename = f"metrics_{int(start_time)}_{int(end_time)}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/metrics/stats")
async def get_metrics_stats(
    start_time: float = Query(..., description="开始时间戳 (Unix 秒)"),
    end_time: float = Query(..., description="结束时间戳 (Unix 秒)"),
):
    if start_time >= end_time:
        raise HTTPException(status_code=400, detail="start_time 必须小于 end_time")
    stats = db.get_metrics_stats(start_time, end_time)
    return {
        "start_time": start_time,
        "end_time": end_time,
        "stats": stats,
    }


@app.get("/alerts")
async def get_alerts(
    start_time: Optional[float] = Query(None, description="开始时间戳 (Unix 秒)"),
    end_time: Optional[float] = Query(None, description="结束时间戳 (Unix 秒)"),
    metric: Optional[str] = Query(None, description="指标名称过滤"),
    acknowledged: Optional[int] = Query(None, description="确认状态 (0=未确认, 1=已确认)"),
    severity: Optional[str] = Query(None, description="严重程度筛选: warning/critical/info/error"),
    limit: int = Query(50, description="每页数量"),
    offset: int = Query(0, description="偏移量"),
):
    return db.query_alerts(start_time, end_time, metric, acknowledged, severity, limit, offset)


@app.get("/alerts/stats")
async def get_alert_stats(
    start_time: Optional[float] = Query(None, description="开始时间戳 (Unix 秒)"),
    end_time: Optional[float] = Query(None, description="结束时间戳 (Unix 秒)"),
):
    return db.get_alert_stats(start_time, end_time)


@app.put("/alerts/acknowledge-all")
async def acknowledge_all_alerts():
    count = db.acknowledge_all_alerts()
    return {"status": "ok", "acknowledged_count": count}


@app.put("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int):
    success = db.acknowledge_alert(alert_id)
    if not success:
        raise HTTPException(status_code=404, detail="告警记录不存在")
    return {"status": "ok"}


@app.delete("/alerts")
async def delete_alerts(
    start_time: Optional[float] = Query(None, description="开始时间戳 (Unix 秒)"),
    end_time: Optional[float] = Query(None, description="结束时间戳 (Unix 秒)"),
):
    count = db.delete_alerts(start_time, end_time)
    return {"status": "ok", "deleted_count": count}


# ========== 告警规则 CRUD ==========
@app.get("/alert-rules")
async def list_alert_rules(enabled_only: bool = Query(False, description="仅返回启用的规则")):
    return {"rules": db.list_alert_rules(enabled_only=enabled_only)}


@app.get("/alert-rules/{rule_id}")
async def get_alert_rule(rule_id: int):
    rule = db.get_alert_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    return rule


@app.post("/alert-rules")
async def create_alert_rule(payload: AlertRuleCreate):
    rule_dict = payload.model_dump()
    if rule_dict.get("silence_windows"):
        rule_dict["silence_windows"] = [
            w.model_dump() if hasattr(w, "model_dump") else w
            for w in rule_dict["silence_windows"]
        ]
    rule_id = db.create_alert_rule(rule_dict)
    return {"status": "ok", "id": rule_id}


@app.put("/alert-rules/{rule_id}")
async def update_alert_rule(rule_id: int, payload: AlertRuleUpdate):
    existing = db.get_alert_rule(rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    update_dict = payload.model_dump(exclude_none=True)
    if "silence_windows" in update_dict:
        update_dict["silence_windows"] = [
            w.model_dump() if hasattr(w, "model_dump") else w
            for w in update_dict["silence_windows"]
        ]
    ok = db.update_alert_rule(rule_id, update_dict)
    return {"status": "ok" if ok else "noop"}


@app.delete("/alert-rules/{rule_id}")
async def delete_alert_rule(rule_id: int):
    ok = db.delete_alert_rule(rule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)
