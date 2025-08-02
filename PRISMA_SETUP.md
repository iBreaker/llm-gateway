# Prisma + Supabase 自动化设置指南

## 🎯 优势

✅ **完全自动化** - 无需手动建表  
✅ **类型安全** - TypeScript 自动生成类型  
✅ **版本控制** - 数据库模式变更可跟踪  
✅ **开发体验** - 内置 Prisma Studio 数据管理工具  

## 📋 设置步骤

### 1. 获取 Supabase 连接信息

登录 [Supabase Dashboard](https://supabase.com/dashboard) → 选择项目 → Settings → Database：

复制 **Connection string** (URI 格式)，类似：
```
postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

### 2. 配置环境变量

在 Vercel 项目设置中添加：

```env
# Prisma 数据库连接
DATABASE_URL="postgresql://postgres:[your-password]@db.[your-project-ref].supabase.co:5432/postgres?schema=public"

# Supabase 配置（可选，用于认证）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. 自动推送数据库模式

部署后，Prisma 适配器会自动：
1. 连接到 Supabase 数据库
2. 推送 `schema.prisma` 中定义的表结构
3. 创建所需的索引和关系

**无需手动操作！**

## 🛠️ 开发命令

```bash
# 生成 Prisma 客户端
npm run db:generate

# 推送模式到数据库（开发环境）
npm run db:push

# 创建迁移文件（生产环境）
npm run db:migrate

# 打开数据库管理界面
npm run db:studio

# 重置数据库（危险操作）
npm run db:reset
```

## 📊 数据库模式

### 用户表 (users)
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API 密钥表 (api_keys)
```sql
CREATE TABLE api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  request_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 上游账号表 (upstream_accounts)
```sql
CREATE TABLE upstream_accounts (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  credentials JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1,
  weight INTEGER DEFAULT 100,
  last_used_at TIMESTAMPTZ,
  request_count BIGINT DEFAULT 0,
  success_count BIGINT DEFAULT 0,
  error_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 使用记录表 (usage_records)
```sql
CREATE TABLE usage_records (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT REFERENCES api_keys(id) ON DELETE CASCADE,
  upstream_account_id BIGINT REFERENCES upstream_accounts(id) ON DELETE SET NULL,
  request_id TEXT UNIQUE NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  response_time INTEGER,
  tokens_used BIGINT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🔧 故障排除

### 连接失败
1. 检查 `DATABASE_URL` 格式是否正确
2. 确认 Supabase 项目状态为 Active
3. 验证密码中的特殊字符是否需要编码

### 权限问题
Prisma 使用 `postgres` 用户直接连接，拥有完整权限，无需担心 RLS 限制。

### 模式同步失败
```bash
# 强制重新推送模式
npm run db:push --force-reset
```

## 🚀 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 中配置环境变量
3. 部署时 Prisma 会自动运行 `prisma generate`
4. 首次启动时自动推送数据库模式

**完全自动化，零手动操作！**