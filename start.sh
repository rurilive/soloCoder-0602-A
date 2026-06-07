#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
LOG_DIR="$PROJECT_DIR/logs"
PID_DIR="$PROJECT_DIR/pids"

mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

get_pgid_of_pid() {
    local pid=$1
    ps -o pgid= "$pid" 2>/dev/null | tr -d ' '
}

get_pids_by_port() {
    local port=$1
    lsof -ti:"$port" 2>/dev/null | tr '\n' ' ' | sed 's/^ *//;s/ *$//'
}

get_pgid_by_port() {
    local port=$1
    local pids=$(get_pids_by_port "$port")
    if [ -n "$pids" ]; then
        for pid in $pids; do
            local pgid=$(get_pgid_of_pid "$pid")
            if [ -n "$pgid" ] && [ "$pgid" -gt 0 ] 2>/dev/null; then
                echo "$pgid"
                return 0
            fi
        done
    fi
    echo ""
    return 1
}

wait_for_port() {
    local port=$1
    local max_wait=${2:-10}
    local waited=0
    while [ $waited -lt $max_wait ]; do
        local pids=$(get_pids_by_port "$port")
        if [ -n "$pids" ]; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 1
}

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
setsid uv run uvicorn main:app --host 0.0.0.0 --port 1111 > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_SETSID_PID=$!
sleep 1

if wait_for_port 1111 10; then
    BACKEND_PIDS=$(get_pids_by_port 1111)
    BACKEND_PGID=$(get_pgid_by_port 1111)
    BACKEND_MAIN_PID=$(echo "$BACKEND_PIDS" | awk '{print $1}')

    if [ -z "$BACKEND_PGID" ]; then
        BACKEND_PGID=$BACKEND_MAIN_PID
    fi

    echo "$BACKEND_MAIN_PID" > "$PID_DIR/backend.pid"
    echo "$BACKEND_PGID" > "$PID_DIR/backend.pgid"
    echo "✅ 后端服务已启动"
    echo "   监听端口: 1111"
    echo "   进程列表: $BACKEND_PIDS"
    echo "   主进程ID: $BACKEND_MAIN_PID"
    echo "   进程组ID: $BACKEND_PGID"
else
    echo "❌ 后端服务启动失败，端口 1111 未在监听"
    cat "$LOG_DIR/backend.log"
    exit 1
fi

echo ""
echo "[4/4] 启动前端服务 (端口 1112)..."
cd "$FRONTEND_DIR"
setsid npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_SETSID_PID=$!
sleep 2

if wait_for_port 1112 15; then
    FRONTEND_PIDS=$(get_pids_by_port 1112)
    FRONTEND_PGID=$(get_pgid_by_port 1112)
    FRONTEND_MAIN_PID=$(echo "$FRONTEND_PIDS" | awk '{print $1}')

    if [ -z "$FRONTEND_PGID" ]; then
        FRONTEND_PGID=$FRONTEND_MAIN_PID
    fi

    echo "$FRONTEND_MAIN_PID" > "$PID_DIR/frontend.pid"
    echo "$FRONTEND_PGID" > "$PID_DIR/frontend.pgid"
    echo "✅ 前端服务已启动"
    echo "   监听端口: 1112"
    echo "   进程列表: $FRONTEND_PIDS"
    echo "   主进程ID: $FRONTEND_MAIN_PID"
    echo "   进程组ID: $FRONTEND_PGID"
else
    echo "❌ 前端服务启动失败，端口 1112 未在监听"
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
