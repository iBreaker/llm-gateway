-- 重构账号提供商架构
-- 删除旧的 claude_code/gemini_cli，使用新的提供商架构

-- 修改 provider 字段的约束，使用新的提供商类型
ALTER TABLE upstream_accounts 
DROP CONSTRAINT upstream_accounts_provider_check;

ALTER TABLE upstream_accounts 
ADD CONSTRAINT upstream_accounts_provider_check 
CHECK (provider IN ('anthropic_api', 'anthropic_oauth', 'gemini_oauth', 'qwen_oauth'));

-- 添加 OAuth 相关字段
ALTER TABLE upstream_accounts 
ADD COLUMN oauth_access_token TEXT,
ADD COLUMN oauth_refresh_token TEXT,
ADD COLUMN oauth_expires_at BIGINT,
ADD COLUMN oauth_scopes TEXT,
ADD COLUMN oauth_extra_data JSONB;

-- 创建索引优化查询
CREATE INDEX idx_upstream_accounts_oauth_expires_at 
ON upstream_accounts(oauth_expires_at) 
WHERE provider = 'anthropic_oauth';

-- 添加注释说明
COMMENT ON COLUMN upstream_accounts.oauth_access_token IS 'OAuth访问令牌（加密存储）';
COMMENT ON COLUMN upstream_accounts.oauth_refresh_token IS 'OAuth刷新令牌（加密存储）';
COMMENT ON COLUMN upstream_accounts.oauth_expires_at IS 'OAuth令牌过期时间（Unix时间戳，毫秒）';
COMMENT ON COLUMN upstream_accounts.oauth_scopes IS 'OAuth授权范围（空格分隔）';
COMMENT ON COLUMN upstream_accounts.oauth_extra_data IS 'OAuth额外数据（JSON格式）';