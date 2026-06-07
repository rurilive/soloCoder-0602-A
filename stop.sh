#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$PROJECT_DIR/pids"

echo "=========================================="
echo "  停止实时监控仪表盘系统"
echo "=========================================="

cleanup_by_port() {
    local port=$1
    local name=$2
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        echo "🔄 停止 $name (端口 $port), 进程: $pids"
        kill -9 $pids 2>/dev/null
        sleep 1
        
        local remaining=$(lsof -ti:$port 2>/dev/null || true)
        if [ -n "$remaining" ]; then
            echo "⚠️  再次尝试清理..."
            kill -9 $remaining 2>/dev/null
            sleep 1
        fi
        
        remaining=$(lsof -ti:$port 2>/dev/null || true)
        if [ -z "$remaining" ]; then
            echo "✅ $name 已停止 (端口 $port 已释放)"
            return 0
        else
            echo "⚠️  $name 仍有进程运行: $remaining"
            return 1
        fi
    else
        echo "✅ $name 未在运行 (端口 $port 未占用)"
        return 0
    fi
}

get_pids_in_pgid() {
    local pgid=$1
    [ "$pgid" -gt 0 ] 2>/dev/null || return 1
    ps -eo pid,pgid 2>/dev/null | awk -v pgid="$pgid" '$2 == pgid { print $1 }'
}

cleanup_by_pgid() {
    local pgid=$1
    local name=$2
    
    local pids=$(get_pids_in_pgid "$pgid")
    if [ -z "$pids" ]; then
        return 0
    fi
    
    echo "🔄 清理 $name 进程组 (PGID: $pgid), 进程: $pids"
    
    kill -9 -- -$pgid 2>/dev/null
    pkill -9 -g "$pgid" 2>/dev/null
    for pid in $pids; do
        kill -9 "$pid" 2>/dev/null
    done
    
    sleep 1
}

cleanup_by_pidfile() {
    local name=$1
    local pid_file="$PID_DIR/$name.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "🔄 清理 $name 进程 (PID: $pid)"
            kill -9 "$pid" 2>/dev/null
            sleep 1
        fi
        rm -f "$pid_file"
    fi
}

echo ""
echo "[1/4] 清理前端服务..."
cleanup_by_port 1112 "前端"

echo ""
echo "[2/4] 清理后端服务..."
cleanup_by_port 1111 "后端"

echo ""
echo "[3/4] 进程组级别清理..."
if [ -f "$PID_DIR/frontend.pgid" ]; then
    cleanup_by_pgid $(cat "$PID_DIR/frontend.pgid") "前端"
    rm -f "$PID_DIR/frontend.pgid"
fi
if [ -f "$PID_DIR/backend.pgid" ]; then
    cleanup_by_pgid $(cat "$PID_DIR/backend.pgid") "后端"
    rm -f "$PID_DIR/backend.pgid"
fi

echo ""
echo "[4/4] PID 文件清理..."
cleanup_by_pidfile "frontend"
cleanup_by_pidfile "backend"

echo ""
echo "🔍 最终验证..."
p1111=$(lsof -ti:1111 2>/dev/null || true)
p1112=$(lsof -ti:1112 2>/dev/null || true)
if [ -z "$p1111" ] && [ -z "$p1112" ]; then
    echo "✅ 端口 1111 和 1112 均已释放"
    SUCCESS=1
else
    echo "❌ 警告: 仍有端口被占用"
    [ -n "$p1111" ] && echo "   端口 1111: $p1111"
    [ -n "$p1112" ] && echo "   端口 1112: $p1112"
    SUCCESS=0
fi

echo ""
echo "=========================================="
if [ "$SUCCESS" -eq 1 ]; then
    echo "  ✅ 所有服务已停止"
else
    echo "  ⚠️  服务停止不完全，请手动检查"
fi
echo "=========================================="
