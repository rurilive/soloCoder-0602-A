#!/bin/bash
trap "kill 0" EXIT

echo "🚀 启动 OAuth2.0 SSO 认证中心..."
echo ""

echo "📦 安装依赖..."
echo "-------------------"

cd "$(dirname "$0")"

echo "🔧 后端服务 (端口 1111)"
bash start-backend.sh &
BACKEND_PID=$!

sleep 3

echo ""
echo "🎨 前端管理控制台 (端口 1112)"
bash start-frontend.sh &
FRONTEND_PID=$!

sleep 2

echo ""
echo "🧪 测试客户端 (端口 8000)"
bash start-test-client.sh &
TEST_CLIENT_PID=$!

echo ""
echo "✅ 所有服务已启动！"
echo "-------------------"
echo "🔙 后端 API:    http://localhost:1111"
echo "📊 API 文档:    http://localhost:1111/docs"
echo "🎨 管理控制台:  http://localhost:1112"
echo "🧪 测试客户端:  http://localhost:8000"
echo ""
echo "按 Ctrl+C 停止所有服务"

wait
