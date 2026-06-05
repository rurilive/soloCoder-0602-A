#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_DIR/logs"

echo "======================================"
echo "  停止实时协作白板服务"
echo "======================================"
echo ""

if [ -f "$LOG_DIR/backend.pid" ]; then
  BACKEND_PID=$(cat "$LOG_DIR/backend.pid")
  if ps -p $BACKEND_PID > /dev/null 2>&1; then
    echo "停止后端服务 (PID: $BACKEND_PID)..."
    kill $BACKEND_PID
    sleep 1
    if ps -p $BACKEND_PID > /dev/null 2>&1; then
      kill -9 $BACKEND_PID
    fi
    echo "  后端服务已停止"
  else
    echo "  后端服务未运行"
  fi
  rm -f "$LOG_DIR/backend.pid"
else
  echo "  未找到后端 PID 文件"
fi

if [ -f "$LOG_DIR/frontend.pid" ]; then
  FRONTEND_PID=$(cat "$LOG_DIR/frontend.pid")
  if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo "停止前端服务 (PID: $FRONTEND_PID)..."
    kill $FRONTEND_PID
    sleep 1
    if ps -p $FRONTEND_PID > /dev/null 2>&1; then
      kill -9 $FRONTEND_PID
    fi
    echo "  前端服务已停止"
  else
    echo "  前端服务未运行"
  fi
  rm -f "$LOG_DIR/frontend.pid"
else
  echo "  未找到前端 PID 文件"
fi

pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "vite --host 0.0.0.0 --port 1112" 2>/dev/null || true

echo ""
echo "======================================"
echo "  所有服务已停止"
echo "======================================"
echo ""
