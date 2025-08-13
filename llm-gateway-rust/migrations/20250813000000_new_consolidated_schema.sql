-- 新架构数据库Schema - 整合所有之前的迁移
-- 创建日期: 2025-08-13
-- 说明: 将ServiceProvider和AuthMethod完全分离的新架构

-- 1. 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. 创建用户表
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. 创建API密钥表
CREATE TABLE api_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    rate_limit INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. 创建上游账号表（新架构：分离服务提供商和认证方式）
CREATE TABLE upstream_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 新架构：分离服务提供商和认证方式
    service_provider VARCHAR(50) NOT NULL CHECK (service_provider IN ('anthropic', 'openai', 'gemini', 'qwen')),
    auth_method VARCHAR(50) NOT NULL CHECK (auth_method IN ('api_key', 'oauth')),
    name VARCHAR(255) NOT NULL,
    -- 通用凭据字段（JSON格式，包含不同认证方式的所有字段）
    credentials JSONB NOT NULL DEFAULT '{}',
    -- OAuth 特定字段（从 credentials 中解析，为了方便查询）
    oauth_expires_at BIGINT,
    oauth_scopes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. 创建使用记录表（整合所有增强功能）
CREATE TABLE usage_records (
    id BIGSERIAL PRIMARY KEY,
    api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    upstream_account_id BIGINT REFERENCES upstream_accounts(id) ON DELETE SET NULL,
    -- 基础请求信息
    request_method VARCHAR(10) NOT NULL,
    request_path VARCHAR(255) NOT NULL,
    response_status INTEGER NOT NULL,
    -- Token 统计详细字段
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    -- 成本和性能
    cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    first_token_latency_ms INTEGER,
    tokens_per_second DECIMAL(10,4),
    queue_time_ms INTEGER DEFAULT 0,
    -- 模型和请求信息
    model_name VARCHAR(100),
    request_type VARCHAR(50) DEFAULT 'chat',
    upstream_provider VARCHAR(50),
    -- 路由决策相关
    routing_strategy VARCHAR(50),
    confidence_score DECIMAL(5,4),
    reasoning TEXT,
    -- 缓存和重试
    cache_hit_rate DECIMAL(5,4),
    retry_count INTEGER NOT NULL DEFAULT 0,
    -- 错误处理
    error_type VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. 创建登录尝试跟踪表
CREATE TABLE login_attempts (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    attempt_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. 创建系统设置表
CREATE TABLE system_settings (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    value_type VARCHAR(50) NOT NULL DEFAULT 'string',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 8. 创建基础索引
-- 用户表索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- API密钥表索引
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- 上游账号表索引
CREATE INDEX idx_upstream_accounts_user_id ON upstream_accounts(user_id);
CREATE INDEX idx_upstream_accounts_service_provider ON upstream_accounts(service_provider);
CREATE INDEX idx_upstream_accounts_auth_method ON upstream_accounts(auth_method);
CREATE INDEX idx_upstream_accounts_provider_auth ON upstream_accounts(service_provider, auth_method);
CREATE INDEX idx_upstream_accounts_oauth_expires_at ON upstream_accounts(oauth_expires_at) WHERE auth_method = 'oauth';

-- 使用记录表索引
CREATE INDEX idx_usage_records_api_key_id ON usage_records(api_key_id);
CREATE INDEX idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX idx_usage_records_model_name ON usage_records(model_name);
CREATE INDEX idx_usage_records_request_type ON usage_records(request_type);
CREATE INDEX idx_usage_records_upstream_provider ON usage_records(upstream_provider);
CREATE INDEX idx_usage_records_total_tokens ON usage_records(total_tokens);
CREATE INDEX idx_usage_records_error_type ON usage_records(error_type) WHERE error_type IS NOT NULL;

-- 复合索引用于统计查询
CREATE INDEX idx_usage_records_stats_query ON usage_records(api_key_id, created_at, upstream_provider, model_name);
CREATE INDEX idx_usage_records_cost_analysis ON usage_records(api_key_id, created_at, cost_usd, total_tokens);

-- 登录尝试表索引
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, attempt_time);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, attempt_time);

-- 系统设置表索引
CREATE INDEX idx_system_settings_key ON system_settings(key);

-- 9. 创建自动更新触发器
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at 
    BEFORE UPDATE ON api_keys 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_upstream_accounts_updated_at 
    BEFORE UPDATE ON upstream_accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at 
    BEFORE UPDATE ON system_settings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 10. 创建使用统计视图
CREATE VIEW usage_stats_summary AS
SELECT 
    api_key_id,
    upstream_provider,
    model_name,
    DATE(created_at) as usage_date,
    COUNT(*) as request_count,
    SUM(input_tokens) as total_input_tokens,
    SUM(output_tokens) as total_output_tokens,
    SUM(cache_creation_tokens) as total_cache_creation_tokens,
    SUM(cache_read_tokens) as total_cache_read_tokens,
    SUM(total_tokens) as total_tokens_consumed,
    SUM(cost_usd) as total_cost_usd,
    AVG(latency_ms) as avg_latency_ms,
    AVG(first_token_latency_ms) as avg_first_token_latency_ms,
    AVG(tokens_per_second) as avg_tokens_per_second,
    AVG(cache_hit_rate) as avg_cache_hit_rate,
    COUNT(CASE WHEN response_status >= 400 THEN 1 END) as error_count,
    AVG(confidence_score) as avg_confidence_score
FROM usage_records 
WHERE created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY api_key_id, upstream_provider, model_name, DATE(created_at);

-- 11. 添加表和字段注释
-- 表注释
COMMENT ON TABLE users IS '用户账号表，存储登录认证信息';
COMMENT ON TABLE api_keys IS 'API密钥表，每个用户可创建多个具有不同权限的密钥';
COMMENT ON TABLE upstream_accounts IS '上游账号表，状态通过实时接口检查判断。新架构：service_provider + auth_method 分离';
COMMENT ON TABLE usage_records IS '使用记录表，详细记录每次API调用的Token消耗、性能和成本信息';
COMMENT ON TABLE login_attempts IS '登录尝试记录表，用于跟踪登录成功/失败次数';
COMMENT ON TABLE system_settings IS '系统设置表，存储全局配置参数';

-- 上游账号字段注释
COMMENT ON COLUMN upstream_accounts.service_provider IS '服务提供商：anthropic, openai, gemini, qwen';
COMMENT ON COLUMN upstream_accounts.auth_method IS '认证方式：api_key, oauth';
COMMENT ON COLUMN upstream_accounts.credentials IS '凭据信息（JSON格式，包含所有认证方式的字段）';
COMMENT ON COLUMN upstream_accounts.oauth_expires_at IS 'OAuth令牌过期时间（Unix时间戳，毫秒）';
COMMENT ON COLUMN upstream_accounts.oauth_scopes IS 'OAuth授权范围（空格分隔）';

-- 使用记录字段注释
COMMENT ON COLUMN usage_records.input_tokens IS '输入Token数量（不包含缓存）';
COMMENT ON COLUMN usage_records.output_tokens IS '输出Token数量';
COMMENT ON COLUMN usage_records.cache_creation_tokens IS '创建缓存时的Token数量（125%计费）';
COMMENT ON COLUMN usage_records.cache_read_tokens IS '从缓存读取的Token数量（10%计费）';
COMMENT ON COLUMN usage_records.total_tokens IS '总Token数量（input + output + cache_creation + cache_read）';
COMMENT ON COLUMN usage_records.model_name IS '使用的具体模型名称，如 claude-3.5-sonnet';
COMMENT ON COLUMN usage_records.request_type IS '请求类型：chat, completion, count_tokens 等';
COMMENT ON COLUMN usage_records.upstream_provider IS '实际使用的上游提供商：Anthropic, Gemini 等';
COMMENT ON COLUMN usage_records.routing_strategy IS '路由策略：load_balance, cost_optimize, performance 等';
COMMENT ON COLUMN usage_records.confidence_score IS '路由决策的信心分数（0.0-1.0）';
COMMENT ON COLUMN usage_records.reasoning IS '路由决策的详细推理过程';
COMMENT ON COLUMN usage_records.cache_hit_rate IS '请求的缓存命中率（0.0-1.0）';
COMMENT ON COLUMN usage_records.first_token_latency_ms IS '首个Token响应时间（毫秒）';
COMMENT ON COLUMN usage_records.tokens_per_second IS 'Token生成速度（tokens/秒）';
COMMENT ON COLUMN usage_records.queue_time_ms IS '请求排队等待时间（毫秒）';
COMMENT ON COLUMN usage_records.retry_count IS '请求重试次数';
COMMENT ON COLUMN usage_records.error_type IS '错误类型：timeout, rate_limit, auth_failed 等';
COMMENT ON COLUMN usage_records.error_message IS '详细错误信息';

-- 登录尝试字段注释
COMMENT ON COLUMN login_attempts.email IS '登录使用的邮箱或用户名';
COMMENT ON COLUMN login_attempts.ip_address IS '登录IP地址';
COMMENT ON COLUMN login_attempts.user_agent IS '客户端User-Agent';
COMMENT ON COLUMN login_attempts.attempt_time IS '登录尝试时间';
COMMENT ON COLUMN login_attempts.success IS '登录是否成功';
COMMENT ON COLUMN login_attempts.failure_reason IS '登录失败原因：invalid_credentials, account_locked, too_many_attempts等';

-- 12. 添加默认管理员用户
INSERT INTO users (username, email, password_hash, is_active) VALUES 
('admin', 'admin@llm-gateway.com', '$2b$12$5KnYbh1GuQoIl3P/wAO08eYPjBqd1fBueLvDZQ6oraM12gl5gCdKq', true);

-- 13. 添加默认系统设置数据
INSERT INTO system_settings (key, value, value_type, description) VALUES
('max_requests_per_minute', '100', 'integer', '每分钟最大请求数'),
('default_model', 'claude-3-sonnet', 'string', '默认使用的模型'),
('enable_caching', 'true', 'boolean', '是否启用响应缓存'),
('cache_ttl_seconds', '300', 'integer', '缓存过期时间（秒）'),
('max_token_limit', '100000', 'integer', '单次请求最大token数'),
('enable_load_balancing', 'true', 'boolean', '是否启用负载均衡'),
('health_check_interval', '60', 'integer', '健康检查间隔（秒）'),
('max_login_attempts', '5', 'integer', '最大登录尝试次数'),
('password_min_length', '6', 'integer', '密码最小长度'),
('token_expiry_hours', '24', 'integer', 'JWT令牌过期时间（小时）'),
('system_name', 'LLM Gateway', 'string', '系统名称'),
('system_description', 'A unified gateway for multiple LLM providers', 'string', '系统描述');

-- 完成新架构数据库Schema创建
-- 注意：
-- 1. 此Schema完全基于新的ServiceProvider + AuthMethod分离架构
-- 2. 整合了所有之前迁移的功能增强
-- 3. 包含完整的索引、约束和注释
-- 4. 支持多种认证方式和详细的使用统计
-- 5. 包含系统设置表和默认配置数据