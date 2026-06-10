# 论坛系统

一个功能完整的论坛系统，包含分区管理、帖子发布、回复讨论、用户认证、Markdown 编辑与图片上传，以及管理后台。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端 | Python 3.12 + FastAPI | 异步高性能 REST API |
| 数据库 | SQLite (aiosqlite) | 异步 SQLAlchemy ORM |
| 前端 | React 19 + Vite 8 | 单页应用 |
| 路由 | React Router v7 | 客户端路由 |
| 认证 | JWT (python-jose + bcrypt) | Bearer Token 认证 |
| 包管理 | uv (后端) / npm (前端) | 依赖管理 |

## 项目结构

```
.
├── backend/                    # 后端 Python 项目
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py            # FastAPI 应用入口，CORS，路由注册
│   │   ├── database.py        # 异步数据库引擎与会话
│   │   ├── models.py          # SQLAlchemy 数据模型
│   │   ├── schemas.py         # Pydantic 请求/响应模型
│   │   ├── auth.py            # JWT 认证与密码工具
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── auth.py        # 注册/登录
│   │       ├── users.py       # 用户信息
│   │       ├── sections.py    # 板块 CRUD
│   │       ├── posts.py       # 帖子与回复
│   │       ├── admin.py       # 管理员操作
│   │       └── upload.py      # 图片上传
│   ├── uploads/               # 上传图片存储目录
│   ├── forum.db               # SQLite 数据库文件（运行后生成）
│   ├── pyproject.toml         # uv 项目配置
│   └── main.py                # 启动入口
├── frontend/                   # 前端 React 项目
│   ├── src/
│   │   ├── main.jsx           # 应用入口
│   │   ├── App.jsx            # 路由配置
│   │   ├── App.css            # 全局样式
│   │   ├── api.js             # Axios 实例
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx # 认证上下文
│   │   ├── components/
│   │   │   ├── Navbar.jsx     # 导航栏
│   │   │   ├── MarkdownRenderer.jsx # Markdown 渲染
│   │   │   └── MarkdownEditor.jsx   # Markdown 编辑器
│   │   └── pages/
│   │       ├── Home.jsx       # 首页（板块列表）
│   │       ├── Login.jsx      # 登录
│   │       ├── Register.jsx   # 注册
│   │       ├── Section.jsx    # 板块帖子列表
│   │       ├── PostDetail.jsx # 帖子详情
│   │       ├── CreatePost.jsx # 发帖
│   │       ├── EditPost.jsx   # 编辑帖子
│   │       ├── Profile.jsx    # 个人中心
│   │       └── Admin.jsx      # 管理后台
│   ├── vite.config.js         # Vite 配置（端口1112 + 代理）
│   └── package.json
```

## 快速开始

### 环境要求

- Python >= 3.12
- Node.js >= 18
- uv >= 0.11
- npm >= 9

### 启动后端

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 1111
```

后端启动后：
- API 地址：http://localhost:1111
- API 文档：http://localhost:1111/docs (Swagger UI)
- 自动创建管理员账户：用户名 `admin`，密码 `admin123`

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端启动后：
- 访问地址：http://localhost:1112
- Vite 开发代理已配置 `/api` 和 `/uploads` 到后端

## 功能清单

### 用户系统

| 功能 | 说明 |
|------|------|
| 用户注册 | 用户名、邮箱、密码注册 |
| 用户登录 | JWT Token 认证，登录后自动跳转首页 |
| 个人中心 | 查看个人信息，修改邮箱和头像 |
| 角色系统 | admin（管理员）、moderator（版主）、user（普通用户） |
| 禁言机制 | 管理员可禁言/解禁用户，禁言用户不可发帖和回复 |

### 板块（分区）

| 功能 | 说明 |
|------|------|
| 板块列表 | 首页展示所有板块，按排序字段排列 |
| 创建板块 | 管理员可创建新板块 |
| 编辑板块 | 管理员可修改板块名称、描述、排序 |
| 删除板块 | 管理员可删除板块 |

### 帖子

| 功能 | 说明 |
|------|------|
| 帖子列表 | 板块内分页浏览，置顶帖优先显示 |
| 发帖 | 登录用户在板块内发帖，支持 Markdown 和图片上传 |
| 帖子详情 | Markdown 渲染，浏览量计数，显示作者信息 |
| 编辑帖子 | 作者可编辑自己的帖子 |
| 删除帖子 | 作者/管理员/版主可软删除帖子 |
| 置顶帖子 | 管理员/版主可置顶/取消置顶帖子 |

### 回复

| 功能 | 说明 |
|------|------|
| 回复帖子 | 登录用户可回复帖子，支持 Markdown |
| 回复列表 | 帖子详情页分页显示回复 |

### 图片上传

| 功能 | 说明 |
|------|------|
| 图片上传 | 支持 JPG/PNG/GIF/WebP 格式，5MB 上限 |
| 编辑器集成 | Markdown 编辑器内置图片上传按钮 |
| 头像上传 | 个人中心可上传头像图片 |

### 管理后台

| 功能 | 说明 |
|------|------|
| 板块管理 | 增删改板块 |
| 用户管理 | 查看用户列表，禁言/解禁用户 |
| 版主管理 | 为板块指定/移除版主 |

## API 接口文档

### 认证相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/auth/register | 用户注册 | 无 |
| POST | /api/auth/login | 用户登录，返回 JWT Token | 无 |

**注册请求体：**
```json
{ "username": "string", "email": "string", "password": "string" }
```

**登录请求体：**
```json
{ "username": "string", "password": "string" }
```

**登录响应：**
```json
{ "access_token": "eyJ...", "token_type": "bearer" }
```

### 用户相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/users/me | 获取当前用户信息 | 必须 |
| PUT | /api/users/me | 更新个人资料 | 必须 |
| GET | /api/users/{id} | 获取指定用户信息 | 无 |
| GET | /api/users/ | 获取用户列表（分页） | 管理员 |

**更新资料请求体：**
```json
{ "email": "string", "avatar": "string" }
```

### 板块相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/sections/ | 获取所有板块 | 无 |
| GET | /api/sections/{id} | 获取板块详情 | 无 |
| POST | /api/sections/ | 创建板块 | 管理员 |
| PUT | /api/sections/{id} | 更新板块 | 管理员 |
| DELETE | /api/sections/{id} | 删除板块 | 管理员 |

**创建板块请求体：**
```json
{ "name": "string", "description": "string", "sort_order": 0 }
```

### 帖子相关

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | /api/sections/{section_id}/posts | 获取板块帖子列表 | 无 |
| POST | /api/sections/{section_id}/posts | 发帖 | 登录 |
| GET | /api/posts/{id} | 获取帖子详情（含回复） | 无 |
| PUT | /api/posts/{id} | 编辑帖子 | 作者 |
| DELETE | /api/posts/{id} | 删除帖子（软删除） | 作者/管理员/版主 |
| POST | /api/posts/{id}/pin | 置顶/取消置顶 | 管理员/版主 |
| POST | /api/posts/{id}/replies | 创建回复 | 登录 |
| GET | /api/posts/{id}/replies | 获取回复列表（分页） | 无 |

**创建帖子请求体：**
```json
{ "title": "string", "content": "string (Markdown)" }
```

**创建回复请求体：**
```json
{ "content": "string (Markdown)" }
```

**分页参数：** `skip`（偏移量，默认0）、`limit`（每页数量，默认20）

### 管理员接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/admin/moderators | 设置版主 | 管理员 |
| DELETE | /api/admin/moderators/{id} | 移除版主 | 管理员 |
| PUT | /api/admin/users/{id}/mute | 禁言/解禁用户 | 管理员 |
| DELETE | /api/admin/posts/{id} | 永久删除帖子 | 管理员 |

**设置版主请求体：**
```json
{ "user_id": 1, "section_id": 1 }
```

**禁言请求体：**
```json
{ "is_muted": true }
```

### 图片上传

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | /api/upload/image | 上传图片 | 登录 |

**请求格式：** `multipart/form-data`，字段名 `file`

**响应：**
```json
{ "url": "/uploads/xxxx.jpg", "filename": "xxxx.jpg" }
```

## 数据模型

### User（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| username | String(50) | 用户名，唯一 |
| email | String(100) | 邮箱，唯一 |
| hashed_password | String(200) | bcrypt 加密密码 |
| avatar | String(200) | 头像路径 |
| role | String(20) | 角色：admin / moderator / user |
| is_muted | Boolean | 是否被禁言 |
| created_at | DateTime | 创建时间 |

### Section（板块）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| name | String(100) | 板块名称 |
| description | Text | 板块描述 |
| sort_order | Integer | 排序权重 |
| created_at | DateTime | 创建时间 |

### Post（帖子）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| title | String(200) | 标题 |
| content | Text | 内容（Markdown） |
| section_id | Integer | 所属板块（外键） |
| author_id | Integer | 作者（外键） |
| is_pinned | Boolean | 是否置顶 |
| is_deleted | Boolean | 是否已删除（软删除） |
| view_count | Integer | 浏览次数 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### Reply（回复）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| content | Text | 内容（Markdown） |
| post_id | Integer | 所属帖子（外键） |
| author_id | Integer | 作者（外键） |
| is_deleted | Boolean | 是否已删除 |
| created_at | DateTime | 创建时间 |

### Moderator（版主）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| user_id | Integer | 用户（外键） |
| section_id | Integer | 板块（外键） |

## 认证机制

系统使用 JWT (JSON Web Token) 进行用户认证：

1. 用户通过 `/api/auth/login` 登录，获取 `access_token`
2. 后续请求在 HTTP Header 中携带 `Authorization: Bearer <token>`
3. Token 有效期 60 分钟
4. Token 中包含用户 ID，服务端解析后获取用户信息
5. 前端将 Token 存储在 localStorage，axios 拦截器自动注入

## 权限矩阵

| 操作 | 游客 | 普通用户 | 版主 | 管理员 |
|------|------|---------|------|--------|
| 浏览板块/帖子 | ✅ | ✅ | ✅ | ✅ |
| 发帖/回复 | ❌ | ✅ | ✅ | ✅ |
| 编辑自己的帖子 | ❌ | ✅ | ✅ | ✅ |
| 删除自己的帖子 | ❌ | ✅ | ✅ | ✅ |
| 删除他人帖子 | ❌ | ❌ | ✅（管辖板块） | ✅ |
| 置顶帖子 | ❌ | ❌ | ✅（管辖板块） | ✅ |
| 管理板块 | ❌ | ❌ | ❌ | ✅ |
| 禁言用户 | ❌ | ❌ | ❌ | ✅ |
| 设置版主 | ❌ | ❌ | ❌ | ✅ |

## 默认账户

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | admin | 系统自动创建的管理员 |

## 开发说明

### 后端开发

```bash
cd backend

# 安装依赖（uv 自动管理虚拟环境）
uv sync

# 启动开发服务器
uv run uvicorn app.main:app --host 0.0.0.0 --port 1111 --reload

# 运行后数据库和上传目录自动创建
# 修改模型后删除 forum.db 可重建数据库
```

### 前端开发

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器（带热更新）
npm run dev

# 生产构建
npm run build
```

### 添加新的 API 端点

1. 在 `backend/app/models.py` 中定义数据模型
2. 在 `backend/app/schemas.py` 中定义 Pydantic 模型
3. 在 `backend/app/routers/` 中创建路由文件
4. 在 `backend/app/main.py` 中注册路由

### 添加新的前端页面

1. 在 `frontend/src/pages/` 中创建页面组件
2. 在 `frontend/src/App.jsx` 中添加路由
3. 在 `frontend/src/App.css` 中添加样式

## 生产部署建议

1. **数据库**：将 SQLite 替换为 PostgreSQL，修改 `database.py` 中的连接字符串
2. **密钥**：修改 `auth.py` 中的 `SECRET_KEY`，使用环境变量管理
3. **静态文件**：使用 Nginx 托管前端构建产物和上传文件
4. **HTTPS**：配置 SSL 证书
5. **图片存储**：考虑使用对象存储（如 S3）替代本地文件系统
6. **进程管理**：使用 Supervisor 或 systemd 管理 uvicorn 进程
7. **反向代理**：使用 Nginx 反向代理前后端，统一端口
