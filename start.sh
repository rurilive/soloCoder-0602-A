#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_PORT=1111
FRONTEND_PORT=1112
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

kill_port() {
    local pids=$(lsof -Pi :$1 -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "端口 $1 被占用，正在清理..."
        kill -9 $pids 2>/dev/null
        sleep 1
    fi
}

echo "=========================================="
echo "  企业通讯录管理系统 - 启动脚本"
echo "=========================================="

check_port $BACKEND_PORT
if [ $? -eq 0 ]; then
    echo "后端端口 $BACKEND_PORT 已被占用"
    kill_port $BACKEND_PORT
fi

check_port $FRONTEND_PORT
if [ $? -eq 0 ]; then
    echo "前端端口 $FRONTEND_PORT 已被占用"
    kill_port $FRONTEND_PORT
fi

echo ""
echo "[1/2] 安装后端依赖..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
    echo "创建uv虚拟环境..."
    uv venv
fi
uv sync
echo "后端依赖安装完成"

echo ""
echo "[2/2] 安装前端依赖..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "安装npm依赖..."
    npm install
fi
echo "前端依赖安装完成"

echo ""
echo "启动后端服务 (端口 $BACKEND_PORT)..."
cd "$BACKEND_DIR"
nohup uv run uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT --reload > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$LOG_DIR/backend.pid"

echo "启动前端服务 (端口 $FRONTEND_PORT)..."
cd "$FRONTEND_DIR"
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"

sleep 3

echo ""
echo "=========================================="
echo "  服务启动完成！"
echo "=========================================="
echo "  后端地址: http://localhost:$BACKEND_PORT"
echo "  前端地址: http://localhost:$FRONTEND_PORT"
echo "  后端API文档: http://localhost:$BACKEND_PORT/docs"
echo ""
echo "  后端PID: $BACKEND_PID"
echo "  前端PID: $FRONTEND_PID"
echo "  日志目录: $LOG_DIR"
echo "=========================================="
