# Supabase 数据库设置指南

## 第一步：在 Supabase Dashboard 中执行以下 SQL

登录 [Supabase Dashboard](https://supabase.com/dashboard) → 进入项目 → SQL Editor → 执行以下 SQL：

```sql
-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建API密钥表
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  request_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建上游账号表
CREATE TABLE IF NOT EXISTS upstream_accounts (
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

-- 创建使用记录表
CREATE TABLE IF NOT EXISTS usage_records (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
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

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_is_active ON upstream_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_priority ON upstream_accounts(priority);

CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_upstream_account_id ON usage_records(upstream_account_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_request_id ON usage_records(request_id);
```

## 第二步：配置 RLS 策略

为了让 Service Role Key 能够操作这些表，我们需要禁用 RLS 或者设置适当的策略：

```sql
-- 禁用 RLS（推荐用于内部系统）
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE upstream_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records DISABLE ROW LEVEL SECURITY;
```

## 第三步：验证表创建

```sql
-- 检查表是否创建成功
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'api_keys', 'upstream_accounts', 'usage_records');

-- 检查索引
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('users', 'api_keys', 'upstream_accounts', 'usage_records');
```

## 环境变量配置

确保以下环境变量在 Vercel 中正确配置：

```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 建议的简化架构

1. **直接使用 Supabase Client**: 不通过复杂的适配器层
2. **Service Role Key**: 用于后端 API 操作，绕过 RLS
3. **Anon Key**: 用于前端认证相关操作
4. **PostgreSQL 原生功能**: 充分利用触发器、约束等数据库特性

这种方案的优势：
- 简单可靠，减少抽象层
- 充分利用 Supabase 的 PostgreSQL 特性
- 避免复杂的 DDL 处理逻辑
- 更好的性能和可维护性