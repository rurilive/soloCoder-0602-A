#!/bin/bash

echo "正在停止在线考试系统服务..."

pkill -f "uvicorn app.main:app" 2>/dev/null
pkill -f "vite" 2>/dev/null

echo "服务已停止"
