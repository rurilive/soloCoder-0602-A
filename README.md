# 在线考试系统

一个功能完整的在线考试系统，支持教师创建题库、组卷、发布考试，学生在线答题并自动评分。

## 技术栈

- **后端**: Python + FastAPI + SQLAlchemy + SQLite
- **前端**: React 18 + React Router + Ant Design
- **包管理**: uv (Python), npm (Node.js)

## 功能特性

### 教师端
- ✅ 题库管理：支持单选题、多选题、判断题的增删改查
- ✅ 考试管理：从题库选择题目组卷，设置考试时间和时长
- ✅ 学生管理：选择参与考试的学生
- ✅ 成绩查看：查看所有学生的考试情况和得分

### 学生端
- ✅ 考试列表：查看可参加的考试和考试状态
- ✅ 在线答题：支持单选、多选、判断题
- ✅ 倒计时：考试时间自动倒计时，结束自动提交
- ✅ 答题卡：快速跳转题目，查看已答/未答状态
- ✅ 成绩查询：提交后立即查看成绩和答题详情

## 项目结构

```
.
├── backend/                 # 后端项目
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py         # 应用入口
│   │   ├── database.py     # 数据库配置
│   │   ├── models.py       # 数据模型
│   │   ├── schemas.py      # Pydantic 模型
│   │   ├── auth.py         # 认证相关
│   │   └── routers/        # API 路由
│   │       ├── auth.py
│   │       ├── questions.py
│   │       ├── exams.py
│   │       └── students.py
│   ├── pyproject.toml      # uv 配置
│   ├── init_data.py        # 初始化数据脚本
│   └── exam_system.db      # SQLite 数据库 (运行后生成)
├── frontend/               # 前端项目
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api.js          # API 封装
│   │   ├── components/     # 公共组件
│   │   └── pages/          # 页面组件
│   │       ├── Login.jsx
│   │       ├── teacher/    # 教师端页面
│   │       └── student/    # 学生端页面
│   ├── package.json
│   └── vite.config.js
├── start.sh                # 一键启动脚本
├── stop.sh                 # 停止脚本
└── README.md
```

## 快速开始

### 环境要求

- Python >= 3.11
- Node.js >= 18
- uv (Python 包管理器)

### 一键启动

```bash
# 给脚本执行权限
chmod +x start.sh stop.sh

# 启动所有服务
./start.sh
```

### 手动启动

#### 1. 启动后端 (端口 1111)

```bash
cd backend

# 安装依赖
uv sync

# 初始化数据（首次运行）
uv run python init_data.py

# 启动服务
uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 --reload
```

#### 2. 启动前端 (端口 1112)

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 访问地址

- 前端界面: http://localhost:1112
- 后端 API: http://localhost:1111
- API 文档: http://localhost:1111/docs

## 默认账号

系统初始化后自动创建以下测试账号：

| 角色 | 用户名 | 密码 | 姓名 |
|------|--------|------|------|
| 教师 | teacher | 123456 | 张老师 |
| 学生 | student1 | 123456 | 学生甲 |
| 学生 | student2 | 123456 | 学生乙 |

## 使用说明

### 教师使用流程

1. 使用教师账号登录
2. 进入「题库管理」，添加单选题、多选题、判断题
3. 进入「考试管理」→「创建考试」
4. 填写考试信息，从题库选择题目，选择参与学生
5. 发布后学生即可在规定时间内参加考试
6. 在考试详情页查看学生的答题情况和成绩

### 学生使用流程

1. 使用学生账号登录
2. 在「我的考试」中查看可参加的考试
3. 考试开始后点击「开始考试」进入答题
4. 答题完成后点击「交卷」或等待时间结束自动提交
5. 提交后查看成绩和答题详情

## API 接口

### 认证相关
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户信息

### 题库管理 (教师)
- `GET /api/questions` - 获取题目列表
- `POST /api/questions` - 创建题目
- `GET /api/questions/{id}` - 获取题目详情
- `PUT /api/questions/{id}` - 更新题目
- `DELETE /api/questions/{id}` - 删除题目

### 考试管理
- `GET /api/exams` - 获取考试列表
- `POST /api/exams` - 创建考试 (教师)
- `GET /api/exams/{id}` - 获取考试详情
- `DELETE /api/exams/{id}` - 删除考试 (教师)
- `GET /api/exams/{id}/participations` - 获取考试参与情况 (教师)

### 学生端
- `GET /api/student/exams` - 获取我的考试列表
- `POST /api/student/exams/{id}/start` - 开始考试
- `POST /api/student/exams/{id}/submit` - 提交试卷
- `GET /api/student/exams/{id}/result` - 获取考试成绩
- `GET /api/student/students` - 获取学生列表 (教师)

## 停止服务

```bash
# 如果使用 start.sh 启动，按 Ctrl+C 即可
# 或使用停止脚本
./stop.sh
```

## 注意事项

1. 数据库文件 `backend/exam_system.db` 会在首次运行时自动创建
2. 生产环境请修改 `backend/app/auth.py` 中的 `SECRET_KEY`
3. 默认 CORS 配置允许所有来源，生产环境请限制来源地址
4. 考试时间基于服务器时间，请确保服务器时间准确
