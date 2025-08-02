# Vercel + Supabase 零配置部署指南

## 🎯 完全自动化 - 无需配置环境变量！

使用 Vercel 官方 Supabase 集成，自动配置所有环境变量。

## 📋 部署步骤

### 1. 连接 GitHub 仓库到 Vercel

1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 "New Project"
3. 选择这个 GitHub 仓库
4. 点击 "Deploy"

### 2. 添加 Supabase 集成

1. 进入 Vercel 项目设置
2. 点击 "Integrations" 标签
3. 搜索并添加 "Supabase" 集成
4. 连接你的 Supabase 项目

**Vercel 会自动配置以下环境变量：**
- `POSTGRES_URL` - 数据库连接 (pooling)
- `POSTGRES_URL_NON_POOLING` - 数据库连接 (direct)
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_ANON_KEY` - 匿名访问密钥
- `SUPABASE_SERVICE_ROLE_KEY` - 服务角色密钥

### 3. 重新部署

配置集成后，触发重新部署：
- 推送新的 commit，或
- 在 Vercel Dashboard 中手动重新部署

## ✅ 自动发生的事情

部署时，系统会自动：

1. **检测环境** - 识别 Vercel + Supabase 环境
2. **选择 Prisma** - 自动使用 Prisma 适配器
3. **连接数据库** - 使用 `POSTGRES_URL_NON_POOLING`
4. **推送模式** - 自动创建所有表和索引
5. **生成类型** - 创建 TypeScript 类型定义

## 📊 自动创建的数据库表

| 表名 | 用途 | 字段数 |
|------|------|--------|
| `users` | 用户管理 | 8 |
| `api_keys` | API密钥 | 11 |
| `upstream_accounts` | 上游账号 | 12 |
| `usage_records` | 使用统计 | 11 |

所有表都会自动创建：
- ✅ 主键和外键约束
- ✅ 索引优化查询性能
- ✅ 默认值和时间戳
- ✅ JSON 字段支持

## 🔧 零配置的优势

### 与手动配置对比

| 方式 | 手动配置 | Vercel 集成 |
|------|----------|-------------|
| 环境变量 | 需要手动复制粘贴 | **自动配置** |
| 数据库连接 | 容易出错 | **自动连接** |
| 安全性 | 需要管理密钥 | **自动轮换** |
| 更新 | 手动同步 | **自动同步** |

### 开发体验

```bash
# 本地开发
npm run dev          # 启动开发服务器
npm run db:studio    # 打开数据库管理界面
npm run db:push      # 推送模式变更

# 生产部署
git push origin main # 自动触发部署和数据库同步
```

## 🚀 验证部署

部署完成后，访问你的应用：

1. **前端界面** - `https://your-app.vercel.app`
2. **API 健康检查** - `https://your-app.vercel.app/api/health`
3. **数据库测试** - `https://your-app.vercel.app/api/debug/test-crud`

## 🆘 故障排除

### 如果部署失败

1. **检查日志** - Vercel Dashboard > Functions > Logs
2. **验证集成** - 确认 Supabase 集成已正确配置
3. **重新部署** - 有时需要重新触发部署

### 常见问题

**Q: 找不到 Supabase 集成？**
A: 确保你有 Supabase 账号并且项目状态为 Active

**Q: 数据库连接失败？**
A: 检查 Supabase 项目是否暂停，免费版有使用限制

**Q: 表没有创建？**
A: 查看部署日志，Prisma 会在首次连接时自动推送模式

## 🎉 完成！

现在你有一个完全自动化的 LLM Gateway：
- ✅ 零配置部署
- ✅ 自动数据库管理
- ✅ 类型安全的 API
- ✅ 实时数据同步

专注于业务逻辑，让 Vercel + Supabase + Prisma 处理基础设施！