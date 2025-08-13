-- 更新代理类型约束，只保留 http 和 socks5 两种类型
-- 将现有的 https 类型转换为 http 类型

-- 首先更新所有 https 类型的记录为 http 类型
UPDATE proxy_configs SET proxy_type = 'http' WHERE proxy_type = 'https';

-- 删除旧的约束
ALTER TABLE proxy_configs DROP CONSTRAINT IF EXISTS proxy_configs_proxy_type_check;

-- 添加新的约束，只允许 http 和 socks5
ALTER TABLE proxy_configs ADD CONSTRAINT proxy_configs_proxy_type_check 
    CHECK (proxy_type IN ('http', 'socks5'));