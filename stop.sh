#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
BACKEND_PORT=1111
FRONTEND_PORT=1112

echo "=========================================="
echo "  企业通讯录管理系统 - 停止脚本"
echo "=========================================="

kill_by_pid() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo "正在停止进程 $pid..."
            kill -9 $pid 2>/dev/null
            rm -f "$pid_file"
        fi
    fi
}

kill_by_port() {
    local port=$1
    local pids=$(lsof -Pi :$port -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "正在停止端口 $port 上的进程..."
        kill -9 $pids 2>/dev/null
    fi
}

echo ""
echo "停止后端服务..."
kill_by_pid "$LOG_DIR/backend.pid"
kill_by_port $BACKEND_PORT

echo "停止前端服务..."
kill_by_pid "$LOG_DIR/frontend.pid"
kill_by_port $FRONTEND_PORT

sleep 1

echo ""
echo "=========================================="
echo "  服务已停止"
echo "=========================================="
echo ""
echo "检查端口状态:"

if lsof -Pi :$BACKEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  后端端口 $BACKEND_PORT: 仍在运行"
else
    echo "  后端端口 $BACKEND_PORT: 已停止"
fi

if lsof -Pi :$FRONTEND_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  前端端口 $FRONTEND_PORT: 仍在运行"
else
    echo "  前端端口 $FRONTEND_PORT: 已停止"
fi
echo "=========================================="
