#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

echo "======================================"
echo "  启动实时协作白板服务"
echo "======================================"

echo ""
echo "[1/2] 启动后端服务 (端口 1111)..."
cd "$BACKEND_DIR"
nohup uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$LOG_DIR/backend.pid"
echo "  后端服务已启动 (PID: $BACKEND_PID)"
echo "  日志文件: $LOG_DIR/backend.log"

echo ""
echo "[2/2] 启动前端服务 (端口 1112)..."
cd "$FRONTEND_DIR"
nohup npx vite --host 0.0.0.0 --port 1112 > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"
echo "  前端服务已启动 (PID: $FRONTEND_PID)"
echo "  日志文件: $LOG_DIR/frontend.log"

echo ""
echo "======================================"
echo "  服务启动完成！"
echo "======================================"
echo ""
echo "  前端地址: http://localhost:1112"
echo "  后端地址: http://localhost:1111"
echo ""
echo "  查看后端日志: tail -f $LOG_DIR/backend.log"
echo "  查看前端日志: tail -f $LOG_DIR/frontend.log"
echo "  停止服务:   ./stop.sh"
echo ""
