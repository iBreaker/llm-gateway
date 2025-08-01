-- ==========================================
-- 数据库触发器定义
-- ==========================================

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 用户表更新时间触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- API 密钥表更新时间触发器
DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 上游账号表更新时间触发器
DROP TRIGGER IF EXISTS update_upstream_accounts_updated_at ON upstream_accounts;
CREATE TRIGGER update_upstream_accounts_updated_at
  BEFORE UPDATE ON upstream_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();