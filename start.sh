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
uv run uvicorn main:app --host 0.0.0.0 --port 1111 > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_DIR/backend.pid"
sleep 2
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo "✅ 后端服务已启动 (PID: $BACKEND_PID)"
else
    echo "❌ 后端服务启动失败"
    cat "$LOG_DIR/backend.log"
    exit 1
fi

echo ""
echo "[4/4] 启动前端服务 (端口 1112)..."
cd "$FRONTEND_DIR"
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PID_DIR/frontend.pid"
sleep 3
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "✅ 前端服务已启动 (PID: $FRONTEND_PID)"
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
