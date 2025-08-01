-- Migration: 更新上游账号表支持三种账号类型
-- Version: 001
-- Date: 2025-08-01

-- 添加约束确保账号类型正确
ALTER TABLE upstream_accounts 
ADD CONSTRAINT check_account_type 
CHECK (type IN ('gemini_oauth', 'claude_oauth', 'llm_gateway'));

-- 更新 credentials 字段的注释，说明不同类型的结构
COMMENT ON COLUMN upstream_accounts.credentials IS '账号凭证信息 (JSON):
- gemini_oauth: {"access_token": "...", "refresh_token": "...", "expires_at": "..."}
- claude_oauth: {"access_token": "...", "refresh_token": "...", "expires_at": "..."}  
- llm_gateway: {"base_url": "https://api.example.com", "api_key": "llmgw_..."}';

-- 更新 email 字段为可选，因为 llm_gateway 类型不需要 email
ALTER TABLE upstream_accounts ALTER COLUMN email DROP NOT NULL;

-- 添加 base_url 字段用于 llm_gateway 类型
ALTER TABLE upstream_accounts ADD COLUMN base_url TEXT;

-- 添加索引提升查询性能
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_active_type ON upstream_accounts(is_active, type);

-- 添加健康检查相关字段
ALTER TABLE upstream_accounts ADD COLUMN last_health_check TIMESTAMPTZ;
ALTER TABLE upstream_accounts ADD COLUMN health_status TEXT DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown'));

-- 更新现有数据的类型（假设现有数据都是 claude_oauth）
UPDATE upstream_accounts SET type = 'claude_oauth' WHERE type NOT IN ('gemini_oauth', 'claude_oauth', 'llm_gateway');