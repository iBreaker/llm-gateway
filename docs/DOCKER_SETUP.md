# Docker 开发环境设置

本项目支持两种 Docker 开发模式：Dev Container 和独立开发模式。

## 🔧 统一的 Docker Compose 配置

项目使用一个统一的 `docker-compose.yml` 文件，支持不同的开发场景：

### 核心服务
- **postgres**: PostgreSQL 16 数据库
- **redis**: Redis 7 缓存 (可选)
- **app**: Dev Container 模式的应用服务
- **app-standalone**: 独立开发模式的应用服务

## 🚀 使用方式

### 1. Dev Container 模式 (推荐)

适合使用 VS Code 和 Dev Container 扩展的开发者。

**前置条件:**
- VS Code
- Dev Containers 扩展
- Docker Desktop

**启动步骤:**
1. 在 VS Code 中打开项目
2. 按 `Ctrl+Shift+P` (或 `Cmd+Shift+P`)
3. 选择 "Dev Containers: Reopen in Container"
4. 等待容器构建和启动

**特性:**
- 🔄 自动安装项目依赖
- 🔧 预配置开发工具和扩展
- 📊 集成 Prisma Studio 和调试工具
- 🌐 端口转发 (13000, 15432, 16379)

### 2. 独立开发模式

适合不使用 Dev Container 但希望用 Docker 管理数据库的开发者。

**启动命令:**
```bash
# 启动数据库服务和独立应用
docker compose --profile standalone up

# 或者只启动数据库，本地运行应用
docker compose up postgres redis
npm run dev
```

**特性:**
- 📦 应用运行在端口 13001 (避免冲突)
- 💾 独立的 node_modules 卷
- 🔄 热重载支持

### 3. 仅数据库模式

只启动数据库服务，应用在本地运行：

```bash
# 启动数据库服务
docker compose up postgres redis -d

# 本地运行应用
npm run dev
```

## 📋 常用命令

### 数据库操作
```bash
# 推送 Prisma 模式到数据库
npm run db:push

# 打开 Prisma Studio
npm run db:studio

# 生成 Prisma 客户端
npm run db:generate

# 重置数据库
npm run db:reset
```

### Docker 管理
```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs app
docker compose logs postgres

# 停止所有服务
docker compose down

# 停止并删除卷
docker compose down -v

# 重新构建镜像
docker compose build --no-cache
```

## 🔧 环境配置

### 环境变量
复制 `.env.example` 到 `.env` 并根据需要修改：

```bash
cp .env.example .env
```

### 数据库连接
不同模式下的数据库连接字符串：

```bash
# Dev Container 内部
DATABASE_URL="postgresql://postgres:postgres@postgres:5432/llm_gateway"

# 本地开发 (Docker 数据库)
DATABASE_URL="postgresql://postgres:postgres@localhost:15432/llm_gateway"
```

## 📊 端口映射

| 服务 | 容器端口 | 主机端口 | 说明 |
|------|----------|----------|------|
| app (Dev Container) | 3000 | 13000 | 主应用 |
| app-standalone | 3000 | 13001 | 独立应用 |
| postgres | 5432 | 15432 | 数据库 |
| redis | 6379 | 16379 | 缓存 |

## 🗃️ 数据持久化

项目使用 Docker 卷来持久化数据：

- `postgres_data`: 数据库数据
- `redis_data`: Redis 数据  
- `node_modules`: Dev Container 依赖
- `node_modules_standalone`: 独立模式依赖

## 🔍 故障排除

### 常见问题

**1. 端口冲突**
```bash
# 检查端口占用
lsof -i :13000
lsof -i :15432

# 停止冲突的服务
docker compose down
```

**2. 数据库连接失败**
```bash
# 检查数据库健康状态
docker compose ps postgres

# 查看数据库日志
docker compose logs postgres
```

**3. 依赖安装问题**
```bash
# 重新构建容器
docker compose build --no-cache app

# 清理 node_modules 卷
docker volume rm llm-gateway_node_modules
```

**4. Dev Container 启动慢**
首次启动需要下载镜像和安装依赖，耐心等待。后续启动会快很多。

### 重置开发环境

完全重置开发环境：
```bash
# 停止所有服务并删除卷
docker compose down -v

# 删除镜像
docker rmi $(docker images llm-gateway* -q)

# 重新启动
docker compose up --build
```

## 📝 开发工作流

### Dev Container 工作流
1. 在 VS Code 中打开容器
2. 修改代码 (自动同步)
3. 运行 `npm run dev` 启动应用
4. 访问 http://localhost:13000

### 独立开发工作流
1. 启动数据库：`docker compose up postgres redis -d`
2. 安装依赖：`npm install`
3. 数据库初始化：`npm run db:push`
4. 启动应用：`npm run dev`
5. 访问 http://localhost:13000