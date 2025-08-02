# Vercel 一键部署指南

## 🚀 零配置部署到 Vercel

### 部署步骤

#### 1. 部署应用
```bash
# 方法一：使用 Vercel CLI
npm i -g vercel
vercel

# 方法二：GitHub 集成
# 1. 推送代码到 GitHub
# 2. 在 Vercel 控制台导入项目
```

#### 2. 添加数据库（自动配置环境变量）
1. 在 Vercel 控制台，进入项目设置
2. 点击 **Storage** 标签
3. 点击 **Connect Database** 
4. 选择 **Create New** → **Postgres**
5. 点击 **Continue**

**✅ 完成！Vercel 会自动设置：**
- `POSTGRES_URL` - 连接池 URL
- `POSTGRES_URL_NON_POOLING` - 直连 URL（用于迁移）

#### 3. 运行数据库迁移
```bash
# 在 Vercel 控制台的 Functions 标签下，或通过 CLI
vercel env pull
npm run db:push
```

### 🎯 就这么简单！

**无需手动配置：**
- ❌ 无需手动设置环境变量
- ❌ 无需外部数据库服务
- ❌ 无需复杂配置

**自动获得：**
- ✅ PostgreSQL 数据库
- ✅ 自动环境变量
- ✅ 连接池支持
- ✅ 备份和监控

## 成本说明

### 免费版限制
- **Vercel**: 免费（100GB 带宽/月）
- **Postgres**: $20/月起（500MB 存储）

### 适用场景
- ✅ **个人项目**: 免费 Vercel + 付费数据库
- ✅ **商业项目**: Vercel Pro ($20/月) + Postgres
- ✅ **企业项目**: 完全可扩展

## 高级配置（可选）

### 环境变量（如需自定义）
```bash
# Vercel 会自动设置，通常无需手动配置
POSTGRES_URL=postgresql://...
POSTGRES_URL_NON_POOLING=postgresql://...
```

### 本地开发
```bash
# 拉取 Vercel 环境变量到本地
vercel env pull

# 本地开发
npm run dev
```

## 故障排除

### 常见问题
1. **数据库连接失败**
   - 确保已在 Vercel 控制台创建 Postgres 数据库
   - 检查环境变量是否自动设置

2. **迁移失败**
   - 使用 `POSTGRES_URL_NON_POOLING` 运行迁移
   - 在 Vercel 控制台的 Functions 页面运行

3. **函数超时**
   - 免费版限制 10 秒
   - 考虑升级到 Pro 版（60 秒）

## 部署验证

部署成功后访问：
- **主页**: `https://your-app.vercel.app`
- **API**: `https://your-app.vercel.app/api/health`
- **管理后台**: `https://your-app.vercel.app/auth/login`

---

**🎉 恭喜！你的 LLM Gateway 已在 Vercel 上运行！**