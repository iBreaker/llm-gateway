-- 添加代理配置支持到上游账号表
-- 创建日期: 2025-08-13 12:00:00
-- 说明: 为upstream_accounts表添加proxy_config字段支持

-- 1. 添加proxy_config字段到upstream_accounts表
ALTER TABLE upstream_accounts 
ADD COLUMN proxy_config JSONB DEFAULT NULL;

-- 2. 添加索引以支持代理配置查询
CREATE INDEX idx_upstream_accounts_proxy_config ON upstream_accounts USING GIN (proxy_config) WHERE proxy_config IS NOT NULL;

-- 3. 添加字段注释
COMMENT ON COLUMN upstream_accounts.proxy_config IS '代理配置信息（JSON格式）：{"enabled": true, "proxy_id": "proxy-1"}';

-- 4. 创建代理配置表（用于存储系统级代理配置）
CREATE TABLE proxy_configs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    proxy_type VARCHAR(20) NOT NULL CHECK (proxy_type IN ('http', 'https', 'socks5')),
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL CHECK (port > 0 AND port <= 65535),
    auth_username VARCHAR(255),
    auth_password VARCHAR(255),
    enabled BOOLEAN NOT NULL DEFAULT true,
    extra_config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. 创建代理配置表索引
CREATE INDEX idx_proxy_configs_enabled ON proxy_configs(enabled);
CREATE INDEX idx_proxy_configs_type ON proxy_configs(proxy_type);
CREATE INDEX idx_proxy_configs_host_port ON proxy_configs(host, port);

-- 6. 添加代理配置表触发器
CREATE TRIGGER update_proxy_configs_updated_at 
    BEFORE UPDATE ON proxy_configs 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 添加表注释
COMMENT ON TABLE proxy_configs IS '系统代理配置表，存储可用的代理服务器配置';
COMMENT ON COLUMN proxy_configs.id IS '代理配置ID（用户定义）';
COMMENT ON COLUMN proxy_configs.name IS '代理配置显示名称';
COMMENT ON COLUMN proxy_configs.proxy_type IS '代理类型：http, https, socks5';
COMMENT ON COLUMN proxy_configs.host IS '代理服务器地址';
COMMENT ON COLUMN proxy_configs.port IS '代理服务器端口';
COMMENT ON COLUMN proxy_configs.auth_username IS '代理认证用户名（可选）';
COMMENT ON COLUMN proxy_configs.auth_password IS '代理认证密码（可选）';
COMMENT ON COLUMN proxy_configs.enabled IS '是否启用此代理配置';
COMMENT ON COLUMN proxy_configs.extra_config IS '额外配置信息（JSON格式）';

-- 8. 插入一些示例代理配置（可选）
INSERT INTO proxy_configs (id, name, proxy_type, host, port, enabled) VALUES
('corp-http', '企业HTTP代理', 'http', '10.0.0.100', 8080, true),
('secure-https', '安全HTTPS代理', 'https', 'secure.proxy.com', 3128, true);

-- 迁移完成