#!/bin/bash

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$PROJECT_DIR/pids"

echo "=========================================="
echo "  停止实时监控仪表盘系统"
echo "=========================================="

stop_service() {
    local name="$1"
    local pid_file="$PID_DIR/$name.pid"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            sleep 1
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid"
                echo "⚠️  $name 服务已强制停止 (PID: $pid)"
            else
                echo "✅ $name 服务已停止 (PID: $pid)"
            fi
        else
            echo "⚠️  $name 服务未在运行 (PID: $pid)"
        fi
        rm -f "$pid_file"
    else
        echo "ℹ️  未找到 $name 服务的 PID 文件"
    fi
}

echo ""
echo "[1/2] 停止前端服务..."
stop_service "frontend"

echo ""
echo "[2/2] 停止后端服务..."
stop_service "backend"

echo ""
echo "=========================================="
echo "  所有服务已停止"
echo "=========================================="
