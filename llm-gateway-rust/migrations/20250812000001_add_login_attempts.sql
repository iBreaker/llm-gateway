-- 添加登录尝试跟踪表
-- 迁移日期: 2025-08-12

-- 创建登录尝试跟踪表
CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    attempt_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT false,
    failure_reason VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_email_time ON login_attempts(email, attempt_time);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, attempt_time);

-- 添加注释
COMMENT ON TABLE login_attempts IS '登录尝试记录表，用于跟踪登录成功/失败次数';
COMMENT ON COLUMN login_attempts.email IS '登录使用的邮箱或用户名';
COMMENT ON COLUMN login_attempts.ip_address IS '登录IP地址';
COMMENT ON COLUMN login_attempts.user_agent IS '客户端User-Agent';
COMMENT ON COLUMN login_attempts.attempt_time IS '登录尝试时间';
COMMENT ON COLUMN login_attempts.success IS '登录是否成功';
COMMENT ON COLUMN login_attempts.failure_reason IS '登录失败原因：invalid_credentials, account_locked, too_many_attempts等';