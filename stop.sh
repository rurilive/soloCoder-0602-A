#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
BACKEND_PID_FILE="$PID_DIR/backend.pid"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"

echo "正在停止在线考试系统服务..."

STOPPED=0

kill_by_pid_file() {
    local pid_file=$1
    local name=$2
    local pkill_pattern=$3
    
    local killed=0
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ]; then
            if kill -0 "$pid" 2>/dev/null; then
                local pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
                if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
                    kill -TERM -"$pgid" 2>/dev/null
                    sleep 1
                    if kill -0 -"$pgid" 2>/dev/null; then
                        kill -KILL -"$pgid" 2>/dev/null
                        sleep 0.5
                    fi
                    echo "${name}服务已停止 (进程组: $pgid)"
                    killed=1
                else
                    kill -TERM "$pid" 2>/dev/null
                    sleep 1
                    if kill -0 "$pid" 2>/dev/null; then
                        kill -KILL "$pid" 2>/dev/null
                    fi
                    echo "${name}服务已停止 (PID: $pid)"
                    killed=1
                fi
            else
                echo "${name}服务PID($pid)已过期，进程不存在"
            fi
        fi
        rm -f "$pid_file"
    else
        echo "未找到${name}服务PID文件"
    fi
    
    if [ $killed -eq 0 ]; then
        local pids=$(pgrep -f "$pkill_pattern" 2>/dev/null)
        if [ -n "$pids" ]; then
            echo "使用pkill兜底停止${name}服务..."
            pkill -TERM -f "$pkill_pattern" 2>/dev/null
            sleep 1
            pids=$(pgrep -f "$pkill_pattern" 2>/dev/null)
            if [ -n "$pids" ]; then
                pkill -KILL -f "$pkill_pattern" 2>/dev/null
            fi
            echo "${name}服务已通过pkill停止"
            killed=1
        fi
    fi
    
    if [ $killed -eq 1 ]; then
        STOPPED=1
    fi
    
    return $killed
}

kill_by_pid_file "$BACKEND_PID_FILE" "后端" "uvicorn app.main:app"
kill_by_pid_file "$FRONTEND_PID_FILE" "前端" "vite.*--port 1112"

if [ $STOPPED -eq 0 ]; then
    pkill -f "uvicorn app.main:app" 2>/dev/null
    pkill -f "vite.*--port 1112" 2>/dev/null
    sleep 0.5
fi

rmdir "$PID_DIR" 2>/dev/null

sleep 0.5

BACKEND_REMAIN=$(pgrep -f "uvicorn app.main:app" 2>/dev/null)
FRONTEND_REMAIN=$(pgrep -f "vite.*--port 1112" 2>/dev/null)

if [ -z "$BACKEND_REMAIN" ] && [ -z "$FRONTEND_REMAIN" ]; then
    echo "所有服务已停止"
else
    echo "警告: 仍有部分进程残留，强制清理..."
    pkill -9 -f "uvicorn app.main:app" 2>/dev/null
    pkill -9 -f "vite.*--port 1112" 2>/dev/null
    echo "强制清理完成"
fi
