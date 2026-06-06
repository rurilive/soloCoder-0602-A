#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

mkdir -p "$PID_DIR"

cleanup() {
    echo ""
    echo "正在停止服务..."
    
    if [ -f "$BACKEND_PID_FILE" ]; then
        BACKEND_PID=$(cat "$BACKEND_PID_FILE" 2>/dev/null)
        if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
            kill "$BACKEND_PID" 2>/dev/null
            echo "后端服务已停止 (PID: $BACKEND_PID)"
        fi
        rm -f "$BACKEND_PID_FILE"
    fi
    
    if [ -f "$FRONTEND_PID_FILE" ]; then
        FRONTEND_PID=$(cat "$FRONTEND_PID_FILE" 2>/dev/null)
        if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
            kill "$FRONTEND_PID" 2>/dev/null
            echo "前端服务已停止 (PID: $FRONTEND_PID)"
        fi
        rm -f "$FRONTEND_PID_FILE"
    fi
    
    echo "服务已全部停止"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "========================================"
echo "       在线考试系统 - 启动脚本"
echo "========================================"

echo ""
echo "检查后端依赖..."
cd "$SCRIPT_DIR/backend"
if [ ! -d ".venv" ]; then
    echo "正在安装后端依赖..."
    uv sync
fi

echo ""
echo "初始化数据库..."
uv run python init_data.py

echo ""
echo "启动后端服务 (端口: 1111)..."
uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 --reload &
BACKEND_PID=$!
echo $BACKEND_PID > "$BACKEND_PID_FILE"
echo "后端服务已启动 (PID: $BACKEND_PID)"

sleep 2

echo ""
echo "检查前端依赖..."
cd "$SCRIPT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖..."
    npm install
fi

echo ""
echo "启动前端服务 (端口: 1112)..."
npm run dev &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
echo "前端服务已启动 (PID: $FRONTEND_PID)"

sleep 2

echo ""
echo "========================================"
echo "服务启动完成！"
echo "后端 API: http://localhost:1111"
echo "前端界面: http://localhost:1112"
echo "========================================"
echo ""
echo "默认测试账号："
echo "教师 - 用户名: teacher, 密码: 123456"
echo "学生 - 用户名: student1, 密码: 123456"
echo "学生 - 用户名: student2, 密码: 123456"
echo ""
echo "按 Ctrl+C 停止所有服务，或运行 ./stop.sh 停止"

wait
