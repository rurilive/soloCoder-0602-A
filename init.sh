#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "=== CI/CD 可视化面板 - 初始化脚本 ==="
echo ""

echo "[1/2] 安装后端依赖..."
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "  创建 Python 虚拟环境..."
    cd "$BACKEND_DIR"
    if command -v uv &> /dev/null; then
        uv venv --python 3.10
    else
        python3 -m venv .venv
    fi
fi

echo "  激活虚拟环境并安装依赖..."
source "$BACKEND_DIR/.venv/bin/activate"
if command -v uv &> /dev/null; then
    uv pip install -r "$BACKEND_DIR/requirements.txt"
else
    pip install -r "$BACKEND_DIR/requirements.txt"
fi
deactivate
echo "  后端依赖安装完成。"
echo ""

echo "[2/2] 安装前端依赖..."
cd "$FRONTEND_DIR"
if command -v npm &> /dev/null; then
    npm install
    echo "  前端依赖安装完成。"
else
    echo "  警告: 未找到 npm，请先安装 Node.js"
    exit 1
fi
echo ""

echo "=== 初始化完成！ ==="
echo ""
echo "使用以下命令启动项目："
echo "  ./start.sh"
echo ""
echo "后端地址: http://localhost:1111"
echo "前端地址: http://localhost:1112"
