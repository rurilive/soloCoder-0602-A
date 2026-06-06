# 企业通讯录管理系统

一个现代化的企业通讯录管理系统，支持组织架构树形展示、员工信息管理、Excel导入导出等功能。

## 技术栈

### 后端
- **Python 3.10+**
- **FastAPI**: 高性能异步Web框架
- **SQLAlchemy 2.0**: ORM框架，支持异步
- **SQLite**: 轻量级数据库
- **uv**: Python包管理工具
- **pandas + openpyxl**: Excel处理

### 前端
- **React 18**
- **TypeScript**
- **Vite**: 构建工具
- **Ant Design 5**: UI组件库
- **Axios**: HTTP客户端

## 功能特性

- 🏢 **组织架构管理**: 树形结构展示，支持多层级部门，可折叠展开
- 👥 **员工管理**: 员工信息的增删改查
- 🔍 **搜索功能**: 支持按姓名、邮箱、电话、职位搜索
- 📊 **Excel导入导出**: 批量导入导出员工数据
- 📱 **响应式设计**: 友好的用户界面

## 端口说明

- 后端服务: **1111** 端口
- 前端服务: **1112** 端口

## 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+
- uv (Python包管理器)

### 安装uv

```bash
# 使用官方脚本安装
curl -LsSf https://astral.sh/uv/install.sh | sh

# 或使用pip安装
pip install uv
```

### 启动服务

#### 方式一：使用启动脚本（推荐）

```bash
# 启动服务
chmod +x start.sh stop.sh
./start.sh

# 停止服务
./stop.sh
```

#### 方式二：手动启动

**后端服务:**

```bash
cd backend

# 创建虚拟环境并安装依赖
uv venv
uv sync

# 启动服务
uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 --reload
```

**前端服务:**

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务
npm run dev
```

### 访问系统

启动成功后，访问以下地址：

- 前端界面: http://localhost:1112
- 后端API文档: http://localhost:1111/docs

## 项目结构

```
.
├── backend/                 # 后端项目
│   ├── app/
│   │   ├── api/            # API路由
│   │   │   ├── departments.py
│   │   │   └── employees.py
│   │   ├── models/         # 数据模型
│   │   │   ├── department.py
│   │   │   └── employee.py
│   │   ├── schemas/        # Pydantic模式
│   │   │   ├── department.py
│   │   │   └── employee.py
│   │   ├── services/       # 业务逻辑
│   │   │   ├── department_service.py
│   │   │   └── employee_service.py
│   │   ├── utils/          # 工具函数
│   │   │   └── excel_handler.py
│   │   ├── database.py     # 数据库配置
│   │   ├── init_data.py    # 初始化数据
│   │   └── main.py         # 应用入口
│   ├── pyproject.toml      # uv配置
│   └── contact.db          # SQLite数据库（自动创建）
├── frontend/               # 前端项目
│   ├── src/
│   │   ├── components/     # React组件
│   │   │   ├── DepartmentTree.tsx
│   │   │   ├── EmployeeTable.tsx
│   │   │   └── EmployeeDetail.tsx
│   │   ├── services/       # API服务
│   │   │   └── api.ts
│   │   ├── types/          # TypeScript类型
│   │   │   └── index.ts
│   │   ├── App.tsx         # 主应用组件
│   │   ├── main.tsx        # 入口文件
│   │   └── index.css       # 全局样式
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── start.sh                # 启动脚本
├── stop.sh                 # 停止脚本
└── README.md
```

## API接口

### 部门管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/departments` | 获取部门树形结构 |
| POST | `/api/departments` | 创建部门 |
| GET | `/api/departments/{id}` | 获取部门详情 |
| PUT | `/api/departments/{id}` | 更新部门 |
| DELETE | `/api/departments/{id}` | 删除部门 |

### 员工管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/employees` | 获取员工列表（支持分页、筛选、搜索） |
| POST | `/api/employees` | 创建员工 |
| GET | `/api/employees/{id}` | 获取员工详情 |
| PUT | `/api/employees/{id}` | 更新员工 |
| DELETE | `/api/employees/{id}` | 删除员工 |
| GET | `/api/employees/search` | 搜索员工 |
| GET | `/api/employees/export/excel` | 导出Excel |
| POST | `/api/employees/import/excel` | 导入Excel |

## Excel导入格式

导入的Excel文件需包含以下列（第一行为表头）：

| 列名 | 必填 | 说明 |
|------|------|------|
| 姓名 | 是 | 员工姓名 |
| 邮箱 | 否 | 电子邮箱 |
| 电话 | 否 | 联系电话 |
| 职位 | 否 | 职位名称 |
| 部门 | 否 | 部门名称（不存在会自动创建） |
| 入职日期 | 否 | YYYY-MM-DD格式 |

## 默认演示数据

系统首次启动时会自动创建以下演示数据：

- 总公司
  - 技术部
    - 前端组
    - 后端组
    - 测试组
  - 销售部
  - 人力资源部
  - 财务部

以及10名示例员工。

## 开发说明

### 后端开发

进入后端目录，使用uv管理依赖：

```bash
cd backend

# 添加依赖
uv add package_name

# 添加开发依赖
uv add --dev package_name

# 运行后端
uv run uvicorn app.main:app --reload
```

### 前端开发

进入前端目录：

```bash
cd frontend

# 添加依赖
npm install package_name

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 日志文件

使用启动脚本运行时，日志文件位于 `logs/` 目录：

- `backend.log`: 后端服务日志
- `frontend.log`: 前端服务日志
- `backend.pid`: 后端进程ID
- `frontend.pid`: 前端进程ID

## 许可证

MIT License
