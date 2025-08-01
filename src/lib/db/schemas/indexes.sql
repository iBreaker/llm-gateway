-- ==========================================
-- 数据库索引定义
-- ==========================================

-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- API 密钥表索引
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- 上游账号表索引
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_is_active ON upstream_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_priority ON upstream_accounts(priority);

-- 使用记录表索引
CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_upstream_account_id ON usage_records(upstream_account_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_request_id ON usage_records(request_id);