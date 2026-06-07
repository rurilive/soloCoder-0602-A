import asyncio
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import HOST, PORT, PUSH_INTERVAL
from metrics.collector import SystemMetricsCollector
from metrics.simulator import BusinessMetricsSimulator
from metrics.models import MetricsData, ThresholdConfig
from websocket.manager import ConnectionManager
from alerts.logger import AlertLogger


collector = SystemMetricsCollector()
simulator = BusinessMetricsSimulator()
manager = ConnectionManager()
alert_logger = AlertLogger()
current_thresholds = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(push_metrics())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


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
            if current_thresholds:
                alerts = alert_logger.check_thresholds(metrics, current_thresholds)

            message = {
                "type": "metrics",
                "data": metrics,
                "alerts": alerts,
            }
            await manager.broadcast(message)
        except Exception as e:
            print(f"Error pushing metrics: {e}")
        await asyncio.sleep(PUSH_INTERVAL)


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
