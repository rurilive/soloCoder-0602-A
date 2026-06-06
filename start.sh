#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_DIR="$SCRIPT_DIR/logs"
PID_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"
mkdir -p "$PID_DIR"

echo "=== 启动 CI/CD 可视化面板 ==="
echo ""

if [ -f "$PID_DIR/backend.pid" ] && kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
    echo "后端服务已在运行 (PID: $(cat "$PID_DIR/backend.pid"))"
else
    echo "[1/2] 启动后端服务 (端口 1111)..."
    cd "$BACKEND_DIR"
    source "$BACKEND_DIR/.venv/bin/activate"
    nohup python "$BACKEND_DIR/main.py" > "$LOG_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"
    deactivate
    sleep 2
    if kill -0 "$(cat "$PID_DIR/backend.pid")" 2>/dev/null; then
        echo "  后端服务已启动 (PID: $(cat "$PID_DIR/backend.pid"))"
    else
        echo "  后端服务启动失败，请查看日志: $LOG_DIR/backend.log"
        exit 1
    fi
fi

if [ -f "$PID_DIR/frontend.pid" ] && kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
    echo "前端服务已在运行 (PID: $(cat "$PID_DIR/frontend.pid"))"
else
    echo "[2/2] 启动前端服务 (端口 1112)..."
    cd "$FRONTEND_DIR"
    nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid"
    sleep 3
    if kill -0 "$(cat "$PID_DIR/frontend.pid")" 2>/dev/null; then
        echo "  前端服务已启动 (PID: $(cat "$PID_DIR/frontend.pid"))"
    else
        echo "  前端服务启动失败，请查看日志: $LOG_DIR/frontend.log"
        exit 1
    fi
fi

echo ""
echo "=== 服务启动成功！ ==="
echo ""
echo "后端 API:  http://localhost:1111"
echo "前端面板:  http://localhost:1112"
echo ""
echo "日志文件:"
echo "  后端: $LOG_DIR/backend.log"
echo "  前端: $LOG_DIR/frontend.log"
echo ""
echo "停止服务: ./stop.sh"
