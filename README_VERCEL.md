# LLM Gateway - 零配置部署版

> 🚀 **一键部署到 Vercel + Supabase，无需配置环境变量！**

## ✨ 特性

- ✅ **零配置部署** - 使用 Vercel Supabase 集成
- ✅ **自动建表** - Prisma 自动推送数据库模式  
- ✅ **类型安全** - 完整的 TypeScript 支持
- ✅ **实时同步** - 数据库模式自动同步

## 🚀 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/iBreaker/llm-gateway)

### 部署步骤

1. **点击上方按钮** - 自动 fork 并部署到 Vercel
2. **添加 Supabase 集成** - 在 Vercel 项目设置中添加 Supabase 集成  
3. **完成！** - 所有环境变量自动配置，数据库自动创建

## 📊 自动创建的功能

部署完成后自动拥有：

- 👥 **用户管理系统** - 注册、登录、权限控制
- 🔑 **API 密钥管理** - 创建、撤销、权限设置
- 🔄 **上游账号池** - Claude、Gemini 账号管理
- 📈 **使用统计** - 请求量、成本、性能监控
- 🛡️ **安全特性** - 限流、认证、审计日志

## 🏗️ 技术架构

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Vercel    │────│   Prisma     │────│    Supabase     │
│   前端+API  │    │   ORM+迁移   │    │  PostgreSQL DB  │
└─────────────┘    └──────────────┘    └─────────────────┘
       │                   │                     │
       ├─ Next.js 14       ├─ 类型安全           ├─ 自动备份
       ├─ 边缘函数         ├─ 自动迁移           ├─ 实时 API
       └─ 自动扩展         └─ 开发工具           └─ 行级安全
```

## 📖 使用指南

### API 端点

```typescript
// 健康检查
GET /api/health

// 用户认证
POST /api/auth/login
POST /api/auth/register

// API 密钥管理  
GET  /api/api-keys
POST /api/api-keys/create

// 上游账号管理
GET  /api/upstream-accounts
POST /api/upstream-accounts/create

// 使用统计
GET /api/stats
```

### 环境变量 (自动配置)

Vercel Supabase 集成自动提供：

```env
POSTGRES_URL              # 数据库连接 (pooling)
POSTGRES_URL_NON_POOLING  # 数据库连接 (direct)  
SUPABASE_URL              # Supabase 项目 URL
SUPABASE_ANON_KEY         # 匿名访问密钥
SUPABASE_SERVICE_ROLE_KEY # 服务角色密钥
```

## 🛠️ 本地开发

```bash
# 克隆仓库
git clone https://github.com/iBreaker/llm-gateway.git
cd llm-gateway

# 安装依赖
npm install

# 配置本地环境变量
cp .env.example .env.local
# 填入你的 Supabase 连接信息

# 推送数据库模式
npm run db:push

# 启动开发服务器
npm run dev
```

## 📚 详细文档

- [VERCEL_SETUP.md](./VERCEL_SETUP.md) - 零配置部署指南
- [PRISMA_SETUP.md](./PRISMA_SETUP.md) - 数据库管理指南
- [docs/](./docs/) - 完整技术文档

## 🤝 贡献

欢迎提交 Issues 和 Pull Requests！

## 📄 许可证

MIT License