-- 增强 usage_records 表以支持详细的 Token 统计和性能指标
-- 迁移日期: 2025-08-12

-- 1. 添加新的 Token 统计字段
ALTER TABLE usage_records ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0;

-- 2. 添加模型和请求信息字段
ALTER TABLE usage_records ADD COLUMN model_name VARCHAR(100);
ALTER TABLE usage_records ADD COLUMN request_type VARCHAR(50) DEFAULT 'chat';
ALTER TABLE usage_records ADD COLUMN upstream_provider VARCHAR(50);

-- 3. 添加路由决策相关字段
ALTER TABLE usage_records ADD COLUMN routing_strategy VARCHAR(50);
ALTER TABLE usage_records ADD COLUMN confidence_score DECIMAL(5,4);
ALTER TABLE usage_records ADD COLUMN reasoning TEXT;

-- 4. 添加缓存性能指标
ALTER TABLE usage_records ADD COLUMN cache_hit_rate DECIMAL(5,4);

-- 5. 添加详细性能指标
ALTER TABLE usage_records ADD COLUMN first_token_latency_ms INTEGER;
ALTER TABLE usage_records ADD COLUMN tokens_per_second DECIMAL(10,4);
ALTER TABLE usage_records ADD COLUMN queue_time_ms INTEGER DEFAULT 0;
ALTER TABLE usage_records ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;

-- 6. 添加错误处理字段
ALTER TABLE usage_records ADD COLUMN error_type VARCHAR(100);
ALTER TABLE usage_records ADD COLUMN error_message TEXT;

-- 7. 从现有 tokens_used 数据迁移到新字段
-- 注意：这是一个近似迁移，因为我们无法从单一数字推断出具体的输入/输出分布
-- 使用经验比例：输入 70%，输出 30%
UPDATE usage_records 
SET 
    input_tokens = CAST(tokens_used * 0.7 AS INTEGER),
    output_tokens = CAST(tokens_used * 0.3 AS INTEGER),
    total_tokens = tokens_used,
    cache_creation_tokens = 0,
    cache_read_tokens = 0
WHERE tokens_used > 0;

-- 8. 删除旧的 tokens_used 字段
ALTER TABLE usage_records DROP COLUMN tokens_used;

-- 9. 创建新索引以支持高效查询
CREATE INDEX idx_usage_records_model_name ON usage_records(model_name);
CREATE INDEX idx_usage_records_request_type ON usage_records(request_type);
CREATE INDEX idx_usage_records_upstream_provider ON usage_records(upstream_provider);
CREATE INDEX idx_usage_records_total_tokens ON usage_records(total_tokens);
CREATE INDEX idx_usage_records_error_type ON usage_records(error_type) WHERE error_type IS NOT NULL;

-- 10. 创建复合索引用于统计查询
CREATE INDEX idx_usage_records_stats_query ON usage_records(api_key_id, created_at, upstream_provider, model_name);
CREATE INDEX idx_usage_records_cost_analysis ON usage_records(api_key_id, created_at, cost_usd, total_tokens);

-- 11. 添加约束确保数据完整性
ALTER TABLE usage_records ADD CONSTRAINT chk_tokens_consistency 
    CHECK (total_tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens);

ALTER TABLE usage_records ADD CONSTRAINT chk_confidence_score_range 
    CHECK (confidence_score IS NULL OR (confidence_score >= 0.0 AND confidence_score <= 1.0));

ALTER TABLE usage_records ADD CONSTRAINT chk_cache_hit_rate_range 
    CHECK (cache_hit_rate IS NULL OR (cache_hit_rate >= 0.0 AND cache_hit_rate <= 1.0));

ALTER TABLE usage_records ADD CONSTRAINT chk_positive_latency 
    CHECK (first_token_latency_ms IS NULL OR first_token_latency_ms >= 0);

ALTER TABLE usage_records ADD CONSTRAINT chk_positive_queue_time 
    CHECK (queue_time_ms >= 0);

ALTER TABLE usage_records ADD CONSTRAINT chk_positive_retry_count 
    CHECK (retry_count >= 0);

-- 12. 创建视图简化常用查询
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

-- 13. 添加注释说明字段用途
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

-- 完成迁移
-- 注意：这个迁移包含了数据迁移步骤，请在生产环境执行前做好备份！