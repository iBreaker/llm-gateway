# LLM Gateway 生产环境使用指南

## 🚀 快速启动

### 方式一：使用脚本（推荐）

```bash
# 启动生产环境
./start-prod.sh

# 停止生产环境
./stop-prod.sh
```

### 方式二：使用 Makefile

```bash
# 构建生产版本
make release

# 启动生产环境（包含构建）
make prod

# 停止所有服务
make stop
```

### 方式三：手动启动

```bash
# 1. 构建 Rust 后端
cd llm-gateway-rust
cargo build --release

# 2. 构建前端
cd ..
NODE_ENV=production npm run build

# 3. 启动 Rust 后端
cd llm-gateway-rust
./target/release/llm-gateway-rust &

# 4. 启动前端
cd ..
npm start &
```

## 🌐 访问地址

- **前端界面**: http://localhost:3000
- **后端API**: http://localhost:9527
- **健康检查**: http://localhost:9527/health

## 📋 环境要求

### 系统要求
- **操作系统**: Linux, macOS, Windows
- **内存**: 最小 2GB，推荐 4GB+
- **磁盘**: 最小 1GB 可用空间

### 软件依赖
- **Rust**: 1.70+ (包含 Cargo)
- **Node.js**: 20.0+ 
- **npm**: 10.0+
- **PostgreSQL**: 14+ (数据库)

### 安装依赖
```bash
# 检查依赖
rust --version
node --version
npm --version

# 安装项目依赖
npm install
cd llm-gateway-rust && cargo fetch
```

## ⚙️ 配置

### 环境变量配置

复制并编辑生产环境配置：
```bash
cp .env.production .env
```

关键配置项：
```bash
# 数据库连接（必须配置）
DATABASE_URL=postgresql://username:password@localhost:5432/llm_gateway_prod

# JWT 密钥（必须更改）
JWT_SECRET=your-production-jwt-secret-key-here
JWT_REFRESH_SECRET=your-production-refresh-secret-key-here

# 服务地址
RUST_BACKEND_URL=http://localhost:9527
NEXT_PUBLIC_RUST_BACKEND_URL=http://localhost:9527

# 安全配置
CORS_ORIGIN=https://your-domain.com
ALLOWED_HOSTS=your-domain.com
```

### 数据库初始化

```bash
# 运行数据库迁移
cd llm-gateway-rust
sqlx migrate run
```

## 📊 监控与日志

### 日志文件
- **Rust 后端**: `rust-prod.log`
- **Next.js 前端**: `next-prod.log`

### 查看日志
```bash
# 实时查看后端日志
tail -f rust-prod.log

# 实时查看前端日志
tail -f next-prod.log

# 同时查看所有日志
tail -f rust-prod.log next-prod.log
```

### 健康检查
```bash
# 检查后端健康状态
curl http://localhost:9527/health

# 检查前端可访问性
curl http://localhost:3000
```

## 🔒 安全建议

### 生产环境安全清单

1. **更改默认密钥**
   - 生成强密码作为 JWT_SECRET
   - 使用不同的 JWT_REFRESH_SECRET

2. **数据库安全**
   - 使用专用数据库用户
   - 限制数据库连接权限
   - 启用 SSL 连接

3. **网络安全**
   - 配置防火墙规则
   - 使用 HTTPS
   - 设置正确的 CORS 策略

4. **进程管理**
   - 使用进程管理器 (systemd, PM2)
   - 设置自动重启
   - 配置资源限制

### 推荐的生产部署架构

```
[Load Balancer] 
    ↓
[Reverse Proxy (Nginx)]
    ↓
[Next.js Frontend] ←→ [Rust Backend]
    ↓                      ↓
[Static Files]        [PostgreSQL]
```

## 🔧 性能优化

### Rust 后端优化
- 调整数据库连接池大小
- 配置适当的工作线程数
- 启用生产模式日志级别

### 前端优化
- 使用 CDN 分发静态资源
- 启用 gzip 压缩
- 配置缓存策略

## 🚨 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查看端口占用
   lsof -i :9527
   lsof -i :3000
   
   # 强制停止
   ./stop-prod.sh
   ```

2. **数据库连接失败**
   - 检查 DATABASE_URL 配置
   - 确认数据库服务状态
   - 验证网络连接

3. **前端无法访问后端**
   - 检查 RUST_BACKEND_URL 配置
   - 确认后端服务启动
   - 验证防火墙设置

### 获取帮助

- 查看日志文件获取详细错误信息
- 使用 `make health` 检查系统状态
- 检查环境变量配置是否正确

## 📈 扩展部署

### Docker 部署
```bash
# 构建镜像
docker build -t llm-gateway .

# 运行容器
docker run -p 3000:3000 -p 9527:9527 llm-gateway
```

### 集群部署
- 使用负载均衡器分发请求
- 部署多个 Rust 后端实例
- 配置共享数据库
- 实现服务发现

---

**注意**: 这是生产环境配置，请确保在部署前充分测试所有功能。