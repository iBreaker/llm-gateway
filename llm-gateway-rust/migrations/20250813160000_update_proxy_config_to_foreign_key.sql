-- 将upstream_accounts表的proxy_config字段从JSONB改为外键
-- 创建日期: 2025-08-13 16:00:00
-- 说明: 修改proxy_config字段为外键，引用proxy_configs表的id字段

-- 1. 删除原有的proxy_config字段和索引
DROP INDEX IF EXISTS idx_upstream_accounts_proxy_config;
ALTER TABLE upstream_accounts DROP COLUMN IF EXISTS proxy_config;

-- 2. 添加新的proxy_config_id外键字段
ALTER TABLE upstream_accounts 
ADD COLUMN proxy_config_id VARCHAR(255) 
REFERENCES proxy_configs(id) ON DELETE SET NULL;

-- 3. 创建新的索引
CREATE INDEX idx_upstream_accounts_proxy_config_id ON upstream_accounts(proxy_config_id) WHERE proxy_config_id IS NOT NULL;

-- 4. 添加字段注释
COMMENT ON COLUMN upstream_accounts.proxy_config_id IS '关联的代理配置ID，引用proxy_configs表';

-- 迁移完成