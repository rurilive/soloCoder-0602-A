# 实时协作白板工具

一个支持多人实时协作的在线白板应用，支持创建房间、通过链接邀请、绘制矩形和自由线条、无限拖拽缩放等功能。

## 技术栈

- **后端**: Python + FastAPI + WebSocket
- **前端**: React + TypeScript + Canvas API
- **包管理**: uv (Python), npm (Node.js)
- **构建工具**: Vite

## 功能特性

- ✅ 创建白板房间
- ✅ 通过链接邀请他人加入
- ✅ 多人实时协作绘制
- ✅ 绘制矩形
- ✅ 自由线条绘制
- ✅ 无限画布拖拽
- ✅ 画布缩放
- ✅ WebSocket 实时同步

## 项目结构

```
.
├── backend/          # FastAPI 后端
│   ├── app/
│   │   ├── main.py   # 主入口
│   │   └── ...
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/         # React 前端
│   ├── src/
│   ├── package.json
│   └── vite.config.ts
├── start.sh          # 启动脚本
├── stop.sh           # 停止脚本
├── .gitignore
└── README.md
```

## 快速开始

### 前置要求

- Python 3.10+
- Node.js 18+
- uv (Python 包管理器)

### 安装依赖

#### 后端

```bash
cd backend
uv sync
```

#### 前端

```bash
cd frontend
npm install
```

### 启动项目

#### 方式一：使用启动脚本（推荐）

```bash
# 启动前后端服务
./start.sh

# 停止服务
./stop.sh
```

#### 方式二：手动启动

**启动后端** (端口 1111):

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 --reload
```

**启动前端** (端口 1112):

```bash
cd frontend
npm run dev
```

### 访问应用

打开浏览器访问: `http://localhost:1112`

## 使用说明

1. 点击「创建房间」创建一个新的白板房间
2. 复制房间链接分享给其他用户
3. 选择绘制工具（矩形/自由线条）
4. 在画布上拖拽绘制
5. 按住空格键 + 鼠标拖拽可以平移画布
6. 使用鼠标滚轮缩放画布

## API 接口

- `GET /api/rooms` - 获取所有房间
- `POST /api/rooms` - 创建新房间
- `GET /api/rooms/{room_id}` - 获取房间信息
- `WebSocket /ws/{room_id}` - WebSocket 连接
