-- 系统代理配置表
CREATE TABLE IF NOT EXISTS proxy_configs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    proxy_type VARCHAR(50) NOT NULL CHECK (proxy_type IN ('http', 'https', 'socks5')),
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL CHECK (port > 0 AND port <= 65535),
    enabled BOOLEAN NOT NULL DEFAULT true,
    auth_username VARCHAR(255),
    auth_password VARCHAR(255),
    extra_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 系统代理全局配置表
CREATE TABLE IF NOT EXISTS system_proxy_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    default_proxy_id VARCHAR(255) REFERENCES proxy_configs(id) ON DELETE SET NULL,
    global_proxy_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 确保只有一行系统配置
INSERT INTO system_proxy_config (id, global_proxy_enabled) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_proxy_configs_enabled ON proxy_configs(enabled);
CREATE INDEX IF NOT EXISTS idx_proxy_configs_type ON proxy_configs(proxy_type);