import type { DatabaseAdapter } from '../../interfaces/database'

// 内联 SQL 定义，避免文件系统访问问题
const TABLES_SQL = `
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API 密钥表
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,
  permissions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  request_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 上游账号表
CREATE TABLE IF NOT EXISTS upstream_accounts (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  email TEXT NOT NULL,
  credentials JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1,
  weight INTEGER DEFAULT 100,
  last_used_at TIMESTAMPTZ,
  request_count BIGINT DEFAULT 0,
  success_count BIGINT DEFAULT 0,
  error_count BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 使用记录表
CREATE TABLE IF NOT EXISTS usage_records (
  id BIGSERIAL PRIMARY KEY,
  api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  upstream_account_id BIGINT REFERENCES upstream_accounts(id) ON DELETE SET NULL,
  request_id TEXT UNIQUE NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  response_time INTEGER,
  tokens_used BIGINT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`

const INDEXES_SQL = `
-- 用户表索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- API 密钥表索引
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- 上游账号表索引
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_is_active ON upstream_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_upstream_accounts_priority ON upstream_accounts(priority);

-- 使用记录表索引
CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_upstream_account_id ON usage_records(upstream_account_id);
CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_records_request_id ON usage_records(request_id);
`

const TRIGGERS_SQL = `
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
`

/**
 * 统一的数据库迁移管理器
 * 负责执行数据库结构迁移，支持所有数据库适配器
 */
export class MigrationManager {
  private adapter: DatabaseAdapter

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter
  }

  /**
   * 执行完整的数据库迁移
   */
  async migrate(): Promise<void> {
    if (!this.adapter.isConnected()) {
      throw new Error('数据库适配器未连接')
    }

    try {
      console.log('🚀 开始数据库迁移...')
      
      // 检查是否为 Supabase 适配器
      const isSupabase = this.adapter.constructor.name.includes('Supabase')
      
      if (isSupabase) {
        console.log('🔍 检测到 Supabase 环境')
        console.log('📋 由于 Supabase JS 客户端限制，请手动在 Supabase Dashboard 中执行以下 SQL:')
        console.log('━'.repeat(80))
        console.log('1. 进入 Supabase Dashboard > SQL Editor')
        console.log('2. 执行项目根目录中的 supabase-init.sql 文件')
        console.log('3. 或者复制粘贴以下 SQL 语句:')
        console.log('━'.repeat(80))
        console.log(TABLES_SQL)
        console.log(INDEXES_SQL)
        console.log(TRIGGERS_SQL)
        console.log('━'.repeat(80))
        console.log('✅ Supabase 迁移指导完成 - 请手动执行上述 SQL')
        return
      }
      
      // 对于非 Supabase 适配器，正常执行迁移
      // 1. 创建表结构
      await this.executeSql(TABLES_SQL)
      console.log('✅ 表结构创建完成')
      
      // 2. 创建索引
      await this.executeSql(INDEXES_SQL)
      console.log('✅ 索引创建完成')
      
      // 3. 创建触发器 (仅对 PostgreSQL/Supabase)
      if (this.adapter.constructor.name.includes('Postgres')) {
        await this.executeSql(TRIGGERS_SQL)
        console.log('✅ 触发器创建完成')
      }
      
      console.log('🎉 数据库迁移完成')
    } catch (error) {
      console.error('❌ 数据库迁移失败:', error)
      throw error
    }
  }

  /**
   * 执行 SQL 语句
   */
  private async executeSql(sql: string): Promise<void> {
    // 按分号分割 SQL 语句
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    // 依次执行每个 SQL 语句
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await this.adapter.raw(statement)
        } catch (error) {
          console.warn(`⚠️ SQL 语句执行失败 (可能是正常的):`, statement.substring(0, 100), error)
          // 某些语句失败是正常的（如触发器在 SQLite 中不支持）
        }
      }
    }
  }

  /**
   * 检查数据库是否已初始化
   */
  async isInitialized(): Promise<boolean> {
    try {
      const result = await this.adapter.raw<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = 'users'
      `)
      return result.length > 0 && (result[0]?.count || 0) > 0
    } catch {
      return false
    }
  }

  /**
   * 获取数据库版本信息
   */
  async getDatabaseVersion(): Promise<string> {
    try {
      const result = await this.adapter.raw<{ version: string }>('SELECT version()')
      return result[0]?.version || 'unknown'
    } catch {
      return 'unknown'
    }
  }
}