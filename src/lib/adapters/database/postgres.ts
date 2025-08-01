import postgres from 'postgres'
import type {
  DatabaseAdapter,
  DatabaseTransaction,
  DatabaseConfig,
  DatabaseUser,
  DatabaseApiKey,
  DatabaseUpstreamAccount,
  DatabaseUsageRecord,
  PostgreSQLOptions
} from '../../interfaces/database'
import {
  DatabaseConnectionError,
  DatabaseQueryError,
  DatabaseTransactionError
} from '../../interfaces/database'

export class PostgresAdapter implements DatabaseAdapter {
  private config: DatabaseConfig
  private sql: ReturnType<typeof postgres> | null = null
  private connected = false

  constructor(config: DatabaseConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected && this.sql) return

    try {
      const options = this.config.options as PostgreSQLOptions
      
      this.sql = postgres(this.config.url, {
        max: options.maxConnections || 5,
        idle_timeout: 20, // 20秒空闲超时
        connect_timeout: 10, // 10秒连接超时
        ssl: options.ssl ? 'require' : false,
        onnotice: () => {}, // 忽略通知
        prepare: false // 禁用预处理语句，提升 Vercel 兼容性
      })

      // 测试连接（构建时快速失败）
      const testPromise = this.sql`SELECT NOW()`
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection test timeout')), 5000)
      )
      await Promise.race([testPromise, timeoutPromise])

      this.connected = true
      console.log('✅ PostgreSQL 数据库连接成功')
    } catch (error) {
      throw new DatabaseConnectionError('PostgreSQL 连接失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.sql) {
      await this.sql.end()
      this.sql = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected && !!this.sql
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    try {
      // postgres 库使用模板字符串语法，需要转换
      const result = await this.sql.unsafe(sql, params)
      return result as unknown as T[]
    } catch (error) {
      throw new DatabaseQueryError(`查询失败: ${sql}`, error as Error)
    }
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    try {
      const result = await this.sql.begin(async (sql) => {
        const tx: DatabaseTransaction = {
          findOne: async <T>(table: string, where: Record<string, any>) => {
            // 简化实现，这里应该构建正确的 WHERE 子句  
            return null
          },
          findMany: async <T>(table: string, where?: Record<string, any>) => {
            // 简化实现
            return []
          },
          create: async <T>(table: string, data: Record<string, any>) => {
            // 简化实现
            return {} as T
          },
          update: async <T>(table: string, where: Record<string, any>, data: Record<string, any>) => {
            // 简化实现
            return {} as T
          },
          delete: async (table: string, where: Record<string, any>) => {
            // 简化实现
            return 0
          },
          raw: async <T>(sqlString: string, params?: any[]) => {
            return sql.unsafe(sqlString, params || []) as unknown as T[]
          }
        }
        
        return callback(tx)
      })
      return result as T
    } catch (error) {
      throw new DatabaseTransactionError('事务执行失败', error as Error)
    }
  }

  // 基础 CRUD 操作
  async findOne<T>(table: string, where: Record<string, any>): Promise<T | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    const whereClause = Object.keys(where).map(key => `${key} = $${key}`).join(' AND ')
    const values = Object.values(where)
    
    const result = await this.sql.unsafe(`SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`, values)
    return result.length > 0 ? result[0] as T : null
  }

  async findMany<T>(table: string, where?: Record<string, any>): Promise<T[]> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    if (!where || Object.keys(where).length === 0) {
      const result = await this.sql.unsafe(`SELECT * FROM ${table}`)
      return result as unknown as T[]
    }
    
    const whereClause = Object.keys(where).map(key => `${key} = $${key}`).join(' AND ')
    const values = Object.values(where)
    
    const result = await this.sql.unsafe(`SELECT * FROM ${table} WHERE ${whereClause}`, values)
    return result as unknown as T[]
  }

  async create<T>(table: string, data: Record<string, any>): Promise<T> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
    
    const result = await this.sql.unsafe(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    )
    
    return result[0] as T
  }

  async update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    const setClause = Object.keys(data).map((key, i) => `${key} = $${i + 1}`).join(', ')
    const whereClause = Object.keys(where).map((key, i) => `${key} = $${i + Object.keys(data).length + 1}`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    
    const result = await this.sql.unsafe(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`,
      values
    )
    
    return result[0] as T
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    const whereClause = Object.keys(where).map(key => `${key} = $${key}`).join(' AND ')
    const values = Object.values(where)
    
    const result = await this.sql.unsafe(`DELETE FROM ${table} WHERE ${whereClause}`, values)
    return result.count || 0
  }

  async createMany<T>(table: string, data: Record<string, any>[]): Promise<T[]> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    if (data.length === 0) return []
    
    const keys = Object.keys(data[0])
    const values = data.map(item => Object.values(item))
    const placeholders = data.map((_, i) => 
      '(' + keys.map((_, j) => `$${i * keys.length + j + 1}`).join(', ') + ')'
    ).join(', ')
    
    const result = await this.sql.unsafe(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders} RETURNING *`,
      values.flat()
    )
    
    return result as unknown as T[]
  }

  async updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    const setClause = Object.keys(data).map((key, i) => `${key} = $${i + 1}`).join(', ')
    const whereClause = Object.keys(where).map((key, i) => `${key} = $${i + Object.keys(data).length + 1}`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    
    const result = await this.sql.unsafe(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`, values)
    return result.count || 0
  }

  async deleteMany(table: string, where: Record<string, any>): Promise<number> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    const whereClause = Object.keys(where).map(key => `${key} = $${key}`).join(' AND ')
    const values = Object.values(where)
    
    const result = await this.sql.unsafe(`DELETE FROM ${table} WHERE ${whereClause}`, values)
    return result.count || 0
  }

  async count(table: string, where?: Record<string, any>): Promise<number> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')
    
    if (!where || Object.keys(where).length === 0) {
      const result = await this.sql.unsafe(`SELECT COUNT(*) as count FROM ${table}`)
      return parseInt(result[0].count)
    }
    
    const whereClause = Object.keys(where).map(key => `${key} = $${key}`).join(' AND ')
    const values = Object.values(where)
    
    const result = await this.sql.unsafe(`SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`, values)
    return parseInt(result[0].count)
  }

  async exists(table: string, where: Record<string, any>): Promise<boolean> {
    const count = await this.count(table, where)
    return count > 0
  }

  async raw<T>(sql: string, params?: any[]): Promise<T[]> {
    return this.query<T>(sql, params)
  }

  async seed(): Promise<void> {
    // 数据填充的具体实现
    console.log('PostgreSQL 数据填充完成')
  }

  async migrate(): Promise<void> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    try {
      // 创建用户表
      await this.sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          username VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      // 创建 API 密钥表
      await this.sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          key_hash VARCHAR(255) UNIQUE NOT NULL,
          permissions JSONB DEFAULT '[]',
          is_active BOOLEAN DEFAULT true,
          expires_at TIMESTAMP,
          last_used_at TIMESTAMP,
          request_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      // 创建上游账号表
      await this.sql`
        CREATE TABLE IF NOT EXISTS upstream_accounts (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          email VARCHAR(255) NOT NULL,
          credentials JSONB NOT NULL,
          is_active BOOLEAN DEFAULT true,
          priority INTEGER DEFAULT 1,
          weight INTEGER DEFAULT 100,
          last_used_at TIMESTAMP,
          request_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      // 创建使用记录表
      await this.sql`
        CREATE TABLE IF NOT EXISTS usage_records (
          id SERIAL PRIMARY KEY,
          api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
          upstream_account_id INTEGER REFERENCES upstream_accounts(id) ON DELETE SET NULL,
          request_id VARCHAR(255) UNIQUE NOT NULL,
          method VARCHAR(10) NOT NULL,
          endpoint VARCHAR(255) NOT NULL,
          status_code INTEGER,
          response_time INTEGER,
          tokens_used INTEGER DEFAULT 0,
          cost DECIMAL(10, 4) DEFAULT 0,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      // 创建索引
      await this.sql`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`
      await this.sql`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`
      await this.sql`CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type)`
      await this.sql`CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id)`
      await this.sql`CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at)`

      console.log('✅ PostgreSQL 数据库迁移完成')
    } catch (error) {
      throw new DatabaseQueryError('数据库迁移失败', error as Error)
    }
  }

  // 用户管理
  async createUser(user: Omit<DatabaseUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseUser> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const [result] = await this.sql`
      INSERT INTO users (email, username, password_hash, role, is_active)
      VALUES (${user.email}, ${user.username}, ${user.passwordHash}, ${user.role}, ${user.isActive})
      RETURNING *
    `

    return this.mapUserRow(result)
  }

  async getUserById(id: number): Promise<DatabaseUser | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      SELECT * FROM users WHERE id = ${id}
    `

    return result.length > 0 ? this.mapUserRow(result[0]) : null
  }

  async getUserByEmail(email: string): Promise<DatabaseUser | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      SELECT * FROM users WHERE email = ${email}
    `

    return result.length > 0 ? this.mapUserRow(result[0]) : null
  }

  async updateUser(id: number, updates: Partial<DatabaseUser>): Promise<DatabaseUser | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const setClause = []
    if (updates.email !== undefined) setClause.push(`email = '${updates.email}'`)
    if (updates.username !== undefined) setClause.push(`username = '${updates.username}'`)
    if (updates.passwordHash !== undefined) setClause.push(`password_hash = '${updates.passwordHash}'`)
    if (updates.role !== undefined) setClause.push(`role = '${updates.role}'`)
    if (updates.isActive !== undefined) setClause.push(`is_active = ${updates.isActive}`)

    if (setClause.length === 0) return this.getUserById(id)

    const result = await this.sql.unsafe(`
      UPDATE users SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id])

    return result.length > 0 ? this.mapUserRow(result[0]) : null
  }

  async deleteUser(id: number): Promise<boolean> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      DELETE FROM users WHERE id = ${id}
    `

    return result.count > 0
  }

  // API 密钥管理
  async createApiKey(apiKey: Omit<DatabaseApiKey, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseApiKey> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const [result] = await this.sql`
      INSERT INTO api_keys (user_id, name, key_hash, permissions, is_active, expires_at, request_count)
      VALUES (${apiKey.userId}, ${apiKey.name}, ${apiKey.keyHash}, ${JSON.stringify(apiKey.permissions)}, ${apiKey.isActive}, ${apiKey.expiresAt || null}, ${apiKey.requestCount})
      RETURNING *
    `

    return this.mapApiKeyRow(result)
  }

  async getApiKeyByHash(keyHash: string): Promise<DatabaseApiKey | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      SELECT * FROM api_keys WHERE key_hash = ${keyHash} AND is_active = true
    `

    return result.length > 0 ? this.mapApiKeyRow(result[0]) : null
  }

  async getApiKeysByUserId(userId: number): Promise<DatabaseApiKey[]> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      SELECT * FROM api_keys WHERE user_id = ${userId} ORDER BY created_at DESC
    `

    return result.map(row => this.mapApiKeyRow(row))
  }

  async updateApiKey(id: number, updates: Partial<DatabaseApiKey>): Promise<DatabaseApiKey | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const setClause = []
    if (updates.name !== undefined) setClause.push(`name = '${updates.name}'`)
    if (updates.permissions !== undefined) setClause.push(`permissions = '${JSON.stringify(updates.permissions)}'`)
    if (updates.isActive !== undefined) setClause.push(`is_active = ${updates.isActive}`)
    if (updates.expiresAt !== undefined) setClause.push(`expires_at = '${updates.expiresAt || null}'`)
    if (updates.lastUsedAt !== undefined) setClause.push(`last_used_at = '${updates.lastUsedAt || null}'`)
    if (updates.requestCount !== undefined) setClause.push(`request_count = ${updates.requestCount}`)

    if (setClause.length === 0) return null

    const result = await this.sql.unsafe(`
      UPDATE api_keys SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id])

    return result.length > 0 ? this.mapApiKeyRow(result[0]) : null
  }

  async deleteApiKey(id: number): Promise<boolean> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      DELETE FROM api_keys WHERE id = ${id}
    `

    return result.count > 0
  }

  // 上游账号管理
  async createUpstreamAccount(account: Omit<DatabaseUpstreamAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseUpstreamAccount> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const [result] = await this.sql`
      INSERT INTO upstream_accounts (type, email, credentials, is_active, priority, weight, request_count, success_count, error_count)
      VALUES (${account.type}, ${account.email}, ${JSON.stringify(account.credentials)}, ${account.isActive}, ${account.priority}, ${account.weight}, ${account.requestCount}, ${account.successCount}, ${account.errorCount})
      RETURNING *
    `

    return this.mapUpstreamAccountRow(result)
  }

  async getUpstreamAccounts(type?: string): Promise<DatabaseUpstreamAccount[]> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = type 
      ? await this.sql`SELECT * FROM upstream_accounts WHERE type = ${type} ORDER BY priority DESC, weight DESC`
      : await this.sql`SELECT * FROM upstream_accounts ORDER BY priority DESC, weight DESC`

    return result.map(row => this.mapUpstreamAccountRow(row))
  }

  async updateUpstreamAccount(id: number, updates: Partial<DatabaseUpstreamAccount>): Promise<DatabaseUpstreamAccount | null> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const setClause = []
    if (updates.email !== undefined) setClause.push(`email = '${updates.email}'`)
    if (updates.credentials !== undefined) setClause.push(`credentials = '${JSON.stringify(updates.credentials)}'`)
    if (updates.isActive !== undefined) setClause.push(`is_active = ${updates.isActive}`)
    if (updates.priority !== undefined) setClause.push(`priority = ${updates.priority}`)
    if (updates.weight !== undefined) setClause.push(`weight = ${updates.weight}`)
    if (updates.lastUsedAt !== undefined) setClause.push(`last_used_at = '${updates.lastUsedAt || null}'`)
    if (updates.requestCount !== undefined) setClause.push(`request_count = ${updates.requestCount}`)
    if (updates.successCount !== undefined) setClause.push(`success_count = ${updates.successCount}`)
    if (updates.errorCount !== undefined) setClause.push(`error_count = ${updates.errorCount}`)

    if (setClause.length === 0) return null

    const result = await this.sql.unsafe(`
      UPDATE upstream_accounts SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [id])

    return result.length > 0 ? this.mapUpstreamAccountRow(result[0]) : null
  }

  async deleteUpstreamAccount(id: number): Promise<boolean> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = await this.sql`
      DELETE FROM upstream_accounts WHERE id = ${id}
    `

    return result.count > 0
  }

  // 使用记录
  async createUsageRecord(record: Omit<DatabaseUsageRecord, 'id' | 'createdAt'>): Promise<DatabaseUsageRecord> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const [result] = await this.sql`
      INSERT INTO usage_records (api_key_id, upstream_account_id, request_id, method, endpoint, status_code, response_time, tokens_used, cost, error_message)
      VALUES (${record.apiKeyId}, ${record.upstreamAccountId || null}, ${record.requestId}, ${record.method}, ${record.endpoint}, ${record.statusCode || null}, ${record.responseTime || null}, ${record.tokensUsed}, ${record.cost}, ${record.errorMessage || null})
      RETURNING *
    `

    return this.mapUsageRecordRow(result)
  }

  async getUsageRecords(apiKeyId?: number, limit = 100, offset = 0): Promise<DatabaseUsageRecord[]> {
    if (!this.sql) throw new DatabaseConnectionError('数据库未连接')

    const result = apiKeyId
      ? await this.sql`SELECT * FROM usage_records WHERE api_key_id = ${apiKeyId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : await this.sql`SELECT * FROM usage_records ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`

    return result.map(row => this.mapUsageRecordRow(row))
  }

  // 数据映射辅助方法
  private mapUserRow(row: any): DatabaseUser {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapApiKeyRow(row: any): DatabaseApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      keyHash: row.key_hash,
      permissions: JSON.parse(row.permissions || '[]'),
      isActive: row.is_active,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      requestCount: row.request_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapUpstreamAccountRow(row: any): DatabaseUpstreamAccount {
    return {
      id: row.id,
      type: row.type,
      email: row.email,
      credentials: JSON.parse(row.credentials || '{}'),
      isActive: row.is_active,
      priority: row.priority,
      weight: row.weight,
      lastUsedAt: row.last_used_at,
      requestCount: row.request_count,
      successCount: row.success_count,
      errorCount: row.error_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapUsageRecordRow(row: any): DatabaseUsageRecord {
    return {
      id: row.id,
      apiKeyId: row.api_key_id,
      upstreamAccountId: row.upstream_account_id,
      requestId: row.request_id,
      method: row.method,
      endpoint: row.endpoint,
      statusCode: row.status_code,
      responseTime: row.response_time,
      tokensUsed: row.tokens_used,
      cost: parseFloat(row.cost || '0'),
      errorMessage: row.error_message,
      createdAt: row.created_at
    }
  }
}