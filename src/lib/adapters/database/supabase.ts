import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  DatabaseAdapter,
  DatabaseTransaction,
  DatabaseConfig,
  QueryOptions,
  DatabaseUser,
  DatabaseApiKey,
  DatabaseUpstreamAccount,
  DatabaseUsageRecord
} from '../../interfaces/database'
import {
  DatabaseConnectionError,
  DatabaseQueryError,
  DatabaseTransactionError
} from '../../interfaces/database'

export class SupabaseAdapter implements DatabaseAdapter {
  private client: SupabaseClient | null = null
  private config: DatabaseConfig

  constructor(config: DatabaseConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      // 从 DATABASE_URL 解析 Supabase 配置
      const url = new URL(this.config.url)
      const supabaseUrl = `https://${url.hostname}`
      const supabaseKey = url.password || process.env.SUPABASE_ANON_KEY
      
      if (!supabaseKey) {
        throw new Error('缺少 Supabase API Key')
      }

      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })

      // 测试连接
      const { error } = await this.client.from('_health_check').select('1').limit(1)
      if (error && !error.message.includes('relation "_health_check" does not exist')) {
        throw error
      }

      console.log('✅ Supabase 数据库连接成功')
    } catch (error) {
      throw new DatabaseConnectionError('Supabase 连接失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      // Supabase 客户端不需要显式断开连接
      this.client = null
      console.log('Supabase 连接已关闭')
    }
  }

  isConnected(): boolean {
    return !!this.client
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')

    try {
      // Supabase 不直接支持事务，这里简化实现
      const tx: DatabaseTransaction = {
        findOne: async <T>(table: string, where: Record<string, any>) => {
          return this.findOne<T>(table, where)
        },
        findMany: async <T>(table: string, where?: Record<string, any>, options?: QueryOptions) => {
          return this.findMany<T>(table, where, options)
        },
        create: async <T>(table: string, data: Record<string, any>) => {
          return this.create<T>(table, data)
        },
        update: async <T>(table: string, where: Record<string, any>, data: Record<string, any>) => {
          return this.update<T>(table, where, data)
        },
        delete: async (table: string, where: Record<string, any>) => {
          return this.delete(table, where)
        },
        raw: async <T>(sql: string, params?: any[]) => {
          return this.raw<T>(sql, params)
        }
      }
      
      return await callback(tx)
    } catch (error) {
      throw new DatabaseTransactionError('事务执行失败', error as Error)
    }
  }

  // 基础 CRUD 操作
  async findOne<T>(table: string, where: Record<string, any>): Promise<T | null> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).select('*')
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { data, error } = await query.single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // No rows found
      throw new DatabaseQueryError(`查询失败: ${table}`, error)
    }
    
    return data as T
  }

  async findMany<T>(table: string, where?: Record<string, any>, options?: QueryOptions): Promise<T[]> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).select('*')
    
    if (where) {
      for (const [key, value] of Object.entries(where)) {
        query = query.eq(key, value)
      }
    }
    
    if (options?.orderBy) {
      for (const order of options.orderBy) {
        query = query.order(order.field, { ascending: order.direction === 'asc' })
      }
    }
    
    if (options?.limit) {
      query = query.limit(options.limit)
    }
    
    if (options?.offset) {
      query = query.range(options.offset, (options.offset + (options.limit || 100)) - 1)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new DatabaseQueryError(`查询失败: ${table}`, error)
    }
    
    return (data || []) as T[]
  }

  async create<T>(table: string, data: Record<string, any>): Promise<T> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    const { data: result, error } = await this.client
      .from(table)
      .insert(data)
      .select()
      .single()
    
    if (error) {
      throw new DatabaseQueryError(`创建记录失败: ${table}`, error)
    }
    
    return result as T
  }

  async update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).update(data)
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { data: result, error } = await query.select().single()
    
    if (error) {
      throw new DatabaseQueryError(`更新记录失败: ${table}`, error)
    }
    
    return result as T
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).delete()
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { count, error } = await query.select('*', { count: 'exact' })
    
    if (error) {
      throw new DatabaseQueryError(`删除记录失败: ${table}`, error)
    }
    
    return count || 0
  }

  async createMany<T>(table: string, data: Record<string, any>[]): Promise<T[]> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    if (data.length === 0) return []
    
    const { data: result, error } = await this.client
      .from(table)
      .insert(data)
      .select()
    
    if (error) {
      throw new DatabaseQueryError(`批量创建记录失败: ${table}`, error)
    }
    
    return (result || []) as T[]
  }

  async updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).update(data)
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { count, error } = await query.select('*', { count: 'exact' })
    
    if (error) {
      throw new DatabaseQueryError(`批量更新记录失败: ${table}`, error)
    }
    
    return count || 0
  }

  async deleteMany(table: string, where: Record<string, any>): Promise<number> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).delete()
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { count, error } = await query.select('*', { count: 'exact' })
    
    if (error) {
      throw new DatabaseQueryError(`批量删除记录失败: ${table}`, error)
    }
    
    return count || 0
  }

  async count(table: string, where?: Record<string, any>): Promise<number> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).select('*', { count: 'exact', head: true })
    
    if (where) {
      for (const [key, value] of Object.entries(where)) {
        query = query.eq(key, value)
      }
    }
    
    const { count, error } = await query
    
    if (error) {
      throw new DatabaseQueryError(`计数查询失败: ${table}`, error)
    }
    
    return count || 0
  }

  async exists(table: string, where: Record<string, any>): Promise<boolean> {
    const count = await this.count(table, where)
    return count > 0
  }

  async raw<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    try {
      const { data, error } = await this.client.rpc('execute_sql', {
        query: sql,
        params: params || []
      })
      
      if (error) {
        throw error
      }
      
      return (data || []) as T[]
    } catch (error) {
      throw new DatabaseQueryError(`SQL 执行失败: ${sql}`, error as Error)
    }
  }

  async migrate(): Promise<void> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')

    try {
      // Supabase 迁移通过 SQL 脚本执行
      const migrationSql = `
        -- 创建用户表
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

        -- 创建 API 密钥表
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

        -- 创建上游账号表
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

        -- 创建使用记录表
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

        -- 创建索引
        CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
        CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
        CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type);
        CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id);
        CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at);

        -- 创建更新时间触发器函数
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- 为用户表和 API 密钥表添加更新时间触发器
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
        CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
        CREATE TRIGGER update_api_keys_updated_at
          BEFORE UPDATE ON api_keys
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_upstream_accounts_updated_at ON upstream_accounts;
        CREATE TRIGGER update_upstream_accounts_updated_at
          BEFORE UPDATE ON upstream_accounts
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
      `

      // 执行迁移（需要在 Supabase 控制台中手动执行，或通过管理 API）
      console.log('⚠️  请在 Supabase SQL 编辑器中执行以下迁移脚本:')
      console.log(migrationSql)
      console.log('✅ Supabase 数据库迁移准备完成')
    } catch (error) {
      throw new DatabaseQueryError('数据库迁移失败', error as Error)
    }
  }

  async seed(): Promise<void> {
    console.log('Supabase 数据填充完成')
  }

  // Supabase 特有的业务方法
  async createUser(user: Omit<DatabaseUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseUser> {
    return this.create<DatabaseUser>('users', {
      email: user.email,
      username: user.username,
      password_hash: user.passwordHash,
      role: user.role,
      is_active: user.isActive
    })
  }

  async getUserById(id: number): Promise<DatabaseUser | null> {
    return this.findOne<DatabaseUser>('users', { id })
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    return this.findOne<DatabaseUser>('users', { email })
  }

  async createApiKey(apiKey: Omit<DatabaseApiKey, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseApiKey> {
    return this.create<DatabaseApiKey>('api_keys', {
      user_id: apiKey.userId,
      name: apiKey.name,
      key_hash: apiKey.keyHash,
      permissions: apiKey.permissions,
      is_active: apiKey.isActive,
      expires_at: apiKey.expiresAt,
      request_count: apiKey.requestCount
    })
  }

  async getApiKeyByHash(keyHash: string): Promise<DatabaseApiKey | null> {
    return this.findOne<DatabaseApiKey>('api_keys', { key_hash: keyHash })
  }

  async createUpstreamAccount(account: Omit<DatabaseUpstreamAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseUpstreamAccount> {
    return this.create<DatabaseUpstreamAccount>('upstream_accounts', {
      type: account.type,
      email: account.email,
      credentials: account.credentials,
      is_active: account.isActive,
      priority: account.priority,
      weight: account.weight
    })
  }

  async getUpstreamAccounts(type?: string): Promise<DatabaseUpstreamAccount[]> {
    return this.findMany<DatabaseUpstreamAccount>('upstream_accounts', type ? { type } : undefined)
  }

  async createUsageRecord(record: Omit<DatabaseUsageRecord, 'id' | 'createdAt'>): Promise<DatabaseUsageRecord> {
    return this.create<DatabaseUsageRecord>('usage_records', {
      api_key_id: record.apiKeyId,
      upstream_account_id: record.upstreamAccountId,
      request_id: record.requestId,
      method: record.method,
      endpoint: record.endpoint,
      status_code: record.statusCode,
      response_time: record.responseTime,
      tokens_used: record.tokensUsed,
      cost: record.cost,
      error_message: record.errorMessage
    })
  }

  async getUsageRecords(apiKeyId?: number, limit = 100, offset = 0): Promise<DatabaseUsageRecord[]> {
    return this.findMany<DatabaseUsageRecord>(
      'usage_records', 
      apiKeyId ? { api_key_id: apiKeyId } : undefined,
      { limit, offset, orderBy: [{ field: 'created_at', direction: 'desc' }] }
    )
  }
}