-- 移除冗余的健康检查字段
-- 因为现在改为通过实时接口判断账号状态

-- 移除上游账号表中的健康检查相关字段
ALTER TABLE upstream_accounts 
    DROP COLUMN IF EXISTS last_health_check,
    DROP COLUMN IF EXISTS response_time_ms,
    DROP COLUMN IF EXISTS error_count,
    DROP COLUMN IF EXISTS error_message;

-- 添加注释说明
COMMENT ON TABLE upstream_accounts IS '上游账号表，状态通过实时接口检查判断';