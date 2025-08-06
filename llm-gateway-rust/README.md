# LLM Gateway Rust 后端

纯 Rust 实现的 LLM Gateway 后端服务。

## 功能特性

- 🔐 JWT 用户认证系统
- 🔑 API Key 管理
- 🌐 多上游账号管理（Claude, Gemini 等）
- ⚖️ 智能负载均衡
- 📊 使用统计和成本跟踪
- 🏥 健康检查和监控

## 快速开始

### 环境要求

- Rust 1.70+
- PostgreSQL 12+

### 安装和运行

1. **克隆仓库**
```bash
git clone <repository-url>
cd llm-gateway/llm-gateway-rust
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件，设置数据库连接等配置
```

3. **运行数据库迁移**
```bash
make db-migrate
```

4. **启动服务器**
```bash
make server
```

服务器将在 http://localhost:8080 启动。

## 数据库管理

本项目使用纯 Rust 的方式管理数据库，不依赖 Node.js 或 Prisma。

### 常用命令

```bash
# 检查数据库连接
make db-check

# 运行迁移
make db-migrate

# 创建新迁移
make db-create

# 重置数据库（危险！会删除所有数据）
make db-reset
```

### 迁移文件

所有数据库迁移文件位于 `migrations/` 目录：
- `001_initial_schema.sql` - 初始数据库结构
- `002_initial_data.sql` - 初始数据（包括默认管理员账号）

## API 端点

### 认证
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `POST /api/auth/refresh` - 刷新 Token
- `GET /api/auth/me` - 获取当前用户信息

### API Key 管理
- `POST /api/keys` - 创建 API Key
- `GET /api/keys` - 列出 API Keys
- `GET /api/keys/:id` - 获取 API Key 详情
- `PUT /api/keys/:id` - 更新 API Key
- `DELETE /api/keys/:id` - 删除 API Key

### 上游账号管理
- `POST /api/upstream-accounts` - 创建上游账号
- `GET /api/upstream-accounts` - 列出上游账号
- `GET /api/upstream-accounts/:id` - 获取账号详情
- `PUT /api/upstream-accounts/:id` - 更新账号
- `DELETE /api/upstream-accounts/:id` - 删除账号
- `GET /api/upstream-accounts/:id/health` - 健康检查

### 代理
- `POST /v1/messages` - 代理 AI 请求（需要 API Key）

## 默认账号

系统初始化后会创建以下默认账号：

- **管理员账号**
  - 用户名: `admin`
  - 密码: `admin123456`
  
- **测试用户**
  - 用户名: `testuser`
  - 密码: `testpass123`

⚠️ **注意**: 请在生产环境中立即修改默认密码！

## 开发

### 运行测试
```bash
make test
```

### 构建发布版本
```bash
make build
```

### 清理构建产物
```bash
make clean
```

## 项目结构

```
llm-gateway-rust/
├── src/
│   ├── main.rs              # 应用入口
│   ├── auth/                # 认证模块
│   ├── handlers/            # HTTP 处理器
│   ├── models/              # 数据模型
│   ├── services/            # 业务服务
│   └── database/            # 数据库层
├── migrations/              # 数据库迁移文件
├── Cargo.toml              # Rust 依赖配置
├── Makefile                # 快捷命令
└── .env.example            # 环境变量示例
```

## 故障排除

### 数据库连接失败
- 检查 PostgreSQL 是否运行
- 确认 DATABASE_URL 环境变量设置正确
- 运行 `make db-check` 测试连接

### 端口已被占用
- 检查 8080 端口是否被占用: `lsof -i :8080`
- 修改 `.env` 中的 `PORT` 配置

## License

MIT