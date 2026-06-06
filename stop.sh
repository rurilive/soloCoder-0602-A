#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

echo "正在停止在线考试系统服务..."

STOPPED=0

if [ -f "$BACKEND_PID_FILE" ]; then
    BACKEND_PID=$(cat "$BACKEND_PID_FILE" 2>/dev/null)
    if [ -n "$BACKEND_PID" ]; then
        if kill -0 "$BACKEND_PID" 2>/dev/null; then
            kill "$BACKEND_PID" 2>/dev/null
            sleep 1
            if kill -0 "$BACKEND_PID" 2>/dev/null; then
                kill -9 "$BACKEND_PID" 2>/dev/null
            fi
            echo "后端服务已停止 (PID: $BACKEND_PID)"
            STOPPED=1
        else
            echo "后端服务未运行 (PID: $BACKEND_PID)"
        fi
    fi
    rm -f "$BACKEND_PID_FILE"
else
    echo "未找到后端服务PID文件"
fi

if [ -f "$FRONTEND_PID_FILE" ]; then
    FRONTEND_PID=$(cat "$FRONTEND_PID_FILE" 2>/dev/null)
    if [ -n "$FRONTEND_PID" ]; then
        if kill -0 "$FRONTEND_PID" 2>/dev/null; then
            kill "$FRONTEND_PID" 2>/dev/null
            sleep 1
            if kill -0 "$FRONTEND_PID" 2>/dev/null; then
                kill -9 "$FRONTEND_PID" 2>/dev/null
            fi
            echo "前端服务已停止 (PID: $FRONTEND_PID)"
            STOPPED=1
        else
            echo "前端服务未运行 (PID: $FRONTEND_PID)"
        fi
    fi
    rm -f "$FRONTEND_PID_FILE"
else
    echo "未找到前端服务PID文件"
fi

rmdir "$PID_DIR" 2>/dev/null

if [ $STOPPED -eq 0 ]; then
    echo "没有运行中的服务需要停止"
else
    echo "服务停止完成"
fi
