#!/bin/bash

echo "========================================"
echo "       在线考试系统 - 启动脚本"
echo "========================================"

echo ""
echo "检查后端依赖..."
cd backend
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

echo ""
echo "检查前端依赖..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    echo "正在安装前端依赖..."
    npm install
fi

echo ""
echo "启动前端服务 (端口: 1112)..."
npm run dev &
FRONTEND_PID=$!

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
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '服务已停止'" EXIT

wait
