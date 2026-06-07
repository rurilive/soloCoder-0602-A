# 实时监控仪表盘

一套基于 WebSocket 的实时监控系统，后端采集系统指标并模拟业务数据，前端实时渲染图表并支持阈值告警。

## 技术栈

- **后端**: Python + FastAPI + psutil + WebSocket
- **前端**: React + Vite + Recharts
- **包管理**: uv (Python), npm (Node)

## 功能特性

- 📊 **实时指标采集**: CPU、内存使用率（真实数据），请求数、响应时间（模拟数据）
- 🔌 **WebSocket 推送**: 每秒推送一次指标数据
- 📈 **动态图表**: 折线图展示，保留最近 60 个数据点
- ⚠️ **阈值告警**: 支持每个指标单独设置上下限，超限时界面标红并记录日志
- 🔄 **自动重连**: WebSocket 断开自动重连

## 快速开始

### 前置要求

- Python >= 3.10
- Node.js >= 18
- uv >= 0.2 (`pip install uv`)

### 启动服务

```bash
# 一键启动
./start.sh
```

启动后访问:
- **前端界面**: http://localhost:1112
- **后端 API**: http://localhost:1111
- **WebSocket**: ws://localhost:1111/ws

### 停止服务

```bash
./stop.sh
```

## 项目结构

```
.
├── start.sh              # 启动脚本
├── stop.sh               # 停止脚本
├── README.md             # 文档
├── backend/              # 后端 FastAPI 项目
│   ├── pyproject.toml    # uv 配置
│   ├── main.py           # 主入口
│   ├── config.py         # 配置
│   ├── metrics/
│   │   ├── collector.py  # psutil 系统指标采集
│   │   ├── simulator.py  # 业务指标模拟
│   │   └── models.py     # 数据模型
│   ├── websocket/
│   │   └── manager.py    # WebSocket 连接管理
│   └── alerts/
│       └── logger.py     # 告警日志记录
└── frontend/             # 前端 React 项目
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx       # 主应用
        ├── components/
        │   ├── MetricChart.jsx     # 折线图组件
        │   ├── AlertBanner.jsx     # 告警横幅
        │   └── ThresholdModal.jsx  # 阈值设置弹窗
        ├── hooks/
        │   └── useWebSocket.js     # WebSocket Hook
        └── utils/
            └── thresholds.js       # 阈值工具函数
```

## API 接口

### 获取当前指标

```
GET /metrics
```

响应示例:
```json
{
  "timestamp": 1717838400.0,
  "cpu_usage": 23.5,
  "memory_usage": 67.2,
  "request_count": 142.3,
  "response_time": 89.5
}
```

### 设置阈值

```
POST /thresholds
Content-Type: application/json

{
  "cpu_usage_max": 80,
  "memory_usage_max": 85,
  "response_time_max": 200
}
```

### 获取当前阈值

```
GET /thresholds
```

### WebSocket

连接 `ws://localhost:1111/ws` 后，每秒会收到推送消息:

```json
{
  "type": "metrics",
  "data": {
    "timestamp": 1717838400.0,
    "cpu_usage": 23.5,
    "memory_usage": 67.2,
    "request_count": 142.3,
    "response_time": 89.5
  },
  "alerts": [
    {
      "metric": "response_time",
      "value": 256.3,
      "threshold_type": "max",
      "threshold_value": 200,
      "timestamp": 1717838400.0
    }
  ]
}
```

## 日志

- 后端日志: `logs/backend.log`
- 前端日志: `logs/frontend.log`
- 告警日志: `backend/alerts.log`

## 配置

可通过环境变量配置后端:

- `HOST`: 绑定地址 (默认 0.0.0.0)
- `PORT`: 后端端口 (默认 1111)
- `PUSH_INTERVAL`: 推送间隔秒数 (默认 1.0)

## 使用说明

1. 启动服务后打开 http://localhost:1112
2. 查看四个实时监控指标折线图
3. 点击右上角「设置阈值」按钮配置告警阈值
4. 当指标超出阈值时:
   - 对应图表边框变红
   - 顶部出现告警横幅
   - 后端记录告警日志到 `alerts.log`
