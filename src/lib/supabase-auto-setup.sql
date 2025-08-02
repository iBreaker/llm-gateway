-- 在 Supabase Dashboard > SQL Editor 中执行此SQL，创建自动化函数

-- 1. 创建执行SQL的RPC函数
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

-- 2. 创建初始化数据库的RPC函数
CREATE OR REPLACE FUNCTION initialize_llm_gateway_db()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- 创建用户表
  EXECUTE 'CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT ''user'',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )';

  -- 创建API密钥表
  EXECUTE 'CREATE TABLE IF NOT EXISTS api_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_hash TEXT UNIQUE NOT NULL,
    permissions JSONB DEFAULT ''[]''::jsonb,
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    request_count BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )';

  -- 创建上游账号表
  EXECUTE 'CREATE TABLE IF NOT EXISTS upstream_accounts (
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
  )';

  -- 创建使用记录表
  EXECUTE 'CREATE TABLE IF NOT EXISTS usage_records (
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
  )';

  -- 创建索引
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)';

  -- 禁用RLS（对于内部系统）
  EXECUTE 'ALTER TABLE users DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE upstream_accounts DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE usage_records DISABLE ROW LEVEL SECURITY';

  result := json_build_object(
    'status', 'success',
    'message', 'LLM Gateway 数据库初始化完成',
    'timestamp', NOW()
  );

  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    result := json_build_object(
      'status', 'error',
      'message', SQLERRM,
      'timestamp', NOW()
    );
    RETURN result;
END;
$$;