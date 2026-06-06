#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/logs"

echo "=== 停止 CI/CD 可视化面板 ==="
echo ""

stopped_any=false

if [ -f "$PID_DIR/backend.pid" ]; then
    BACKEND_PID=$(cat "$PID_DIR/backend.pid")
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "停止后端服务 (PID: $BACKEND_PID)..."
        kill "$BACKEND_PID"
        sleep 1
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            echo "  强制停止..."
            kill -9 "$BACKEND_PID"
        fi
        echo "  后端服务已停止。"
        stopped_any=true
    else
        echo "后端服务未运行。"
    fi
    rm -f "$PID_DIR/backend.pid"
else
    echo "未找到后端服务 PID 文件。"
fi

if [ -f "$PID_DIR/frontend.pid" ]; then
    FRONTEND_PID=$(cat "$PID_DIR/frontend.pid")
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "停止前端服务 (PID: $FRONTEND_PID)..."
        kill "$FRONTEND_PID"
        sleep 1
        if kill -0 "$FRONTEND_PID" 2>/dev/null; then
            echo "  强制停止..."
            kill -9 "$FRONTEND_PID"
        fi
        echo "  前端服务已停止。"
        stopped_any=true
    else
        echo "前端服务未运行。"
    fi
    rm -f "$PID_DIR/frontend.pid"
else
    echo "未找到前端服务 PID 文件。"
fi

echo ""
if [ "$stopped_any" = true ]; then
    echo "=== 所有服务已停止 ==="
else
    echo "=== 没有运行中的服务 ==="
fi
