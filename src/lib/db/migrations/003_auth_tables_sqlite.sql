-- SQLite 版本的认证表迁移脚本
-- 注意：SQLite 不支持某些 PostgreSQL 特性，这里做了简化

-- 用户配置表
CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
    preferences TEXT DEFAULT '{}', -- SQLite 使用 TEXT 存储 JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 为现有的上游账号表添加用户关联
ALTER TABLE upstream_accounts 
ADD COLUMN user_id TEXT REFERENCES user_profiles(id) ON DELETE CASCADE;

-- 为现有的 API 密钥表添加用户关联  
ALTER TABLE api_keys
ADD COLUMN user_id TEXT REFERENCES user_profiles(id) ON DELETE CASCADE;

-- 为现有的使用统计表添加用户关联
ALTER TABLE usage_stats
ADD COLUMN user_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 创建用户会话表
CREATE TABLE IF NOT EXISTS user_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    ip_address TEXT,
    user_agent TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建用户活动日志表
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT DEFAULT '{}', -- SQLite 使用 TEXT 存储 JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高性能
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_user_id ON upstream_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_id ON usage_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);

-- SQLite 触发器用于更新 updated_at 字段
CREATE TRIGGER IF NOT EXISTS update_user_profiles_updated_at 
    AFTER UPDATE ON user_profiles
    FOR EACH ROW
    BEGIN
        UPDATE user_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- 创建默认管理员用户（开发环境）
INSERT OR IGNORE INTO user_profiles (id, email, full_name, role, created_at, updated_at)
VALUES (
    'admin-dev-user',
    'admin@localhost',
    'Development Admin',
    'admin',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);