#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/pids"

mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

echo "=========================================="
echo "  启动实时监控仪表盘系统"
echo "=========================================="

if command -v uv &> /dev/null; then
    echo "✅ 检测到 uv 已安装"
else
    echo "❌ 未检测到 uv，请先安装: pip install uv"
    exit 1
fi

echo ""
echo "[1/4] 安装后端依赖..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
    uv venv
fi
uv sync
echo "✅ 后端依赖安装完成"

echo ""
echo "[2/4] 安装前端依赖..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install
fi
echo "✅ 前端依赖安装完成"

echo ""
echo "[3/4] 启动后端服务 (端口 1111)..."
cd "$BACKEND_DIR"
setsid bash -c "exec uv run uvicorn main:app --host 0.0.0.0 --port 1111 > '$LOG_DIR/backend.log' 2>&1" &
BACKEND_PID=$!
sleep 2

BACKEND_PGID=""
if kill -0 $BACKEND_PID 2>/dev/null; then
    BACKEND_PGID=$(ps -o pgid= $BACKEND_PID 2>/dev/null | tr -d ' ')
    if [ -z "$BACKEND_PGID" ]; then
        BACKEND_PGID=$BACKEND_PID
    fi
    echo $BACKEND_PID > "$PID_DIR/backend.pid"
    echo $BACKEND_PGID > "$PID_DIR/backend.pgid"
    echo "✅ 后端服务已启动 (PID: $BACKEND_PID, PGID: $BACKEND_PGID)"
else
    echo "❌ 后端服务启动失败"
    cat "$LOG_DIR/backend.log"
    exit 1
fi

echo ""
echo "[4/4] 启动前端服务 (端口 1112)..."
cd "$FRONTEND_DIR"
setsid bash -c "exec npm run dev > '$LOG_DIR/frontend.log' 2>&1" &
FRONTEND_PID=$!
sleep 4

FRONTEND_PGID=""
if kill -0 $FRONTEND_PID 2>/dev/null; then
    FRONTEND_PGID=$(ps -o pgid= $FRONTEND_PID 2>/dev/null | tr -d ' ')
    if [ -z "$FRONTEND_PGID" ]; then
        FRONTEND_PGID=$FRONTEND_PID
    fi
    echo $FRONTEND_PID > "$PID_DIR/frontend.pid"
    echo $FRONTEND_PGID > "$PID_DIR/frontend.pgid"
    echo "✅ 前端服务已启动 (PID: $FRONTEND_PID, PGID: $FRONTEND_PGID)"
else
    echo "❌ 前端服务启动失败"
    cat "$LOG_DIR/frontend.log"
    exit 1
fi

echo ""
echo "=========================================="
echo "  🎉 系统启动完成！"
echo "=========================================="
echo "  后端 API:  http://localhost:1111"
echo "  WebSocket: ws://localhost:1111/ws"
echo "  前端界面:  http://localhost:1112"
echo ""
echo "  日志目录:  $LOG_DIR"
echo "  PID 目录:  $PID_DIR"
echo ""
echo "  停止服务:  ./stop.sh"
echo "=========================================="
