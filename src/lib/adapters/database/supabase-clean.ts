import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  DatabaseAdapter,
  DatabaseTransaction,
  DatabaseConfig,
  QueryOptions
} from '../../interfaces/database'
import {
  DatabaseConnectionError,
  DatabaseQueryError,
  DatabaseTransactionError
} from '../../interfaces/database'
import { MigrationManager } from '../../db/schemas/migration-manager'

/**
 * 纯粹的 Supabase 适配器实现
 * 只提供基础的数据库操作，不包含业务逻辑
 */
export class SupabaseAdapter implements DatabaseAdapter {
  private client: SupabaseClient | null = null
  private config: DatabaseConfig
  private migrationManager?: MigrationManager

  constructor(config: DatabaseConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      // 获取 Supabase URL 和 API Key
      const supabaseUrl = process.env.SUPABASE_URL || this.config.url
      const supabaseKey = process.env.SUPABASE_ANON_KEY
      
      console.log('🔍 Supabase 连接配置:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
        urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT_SET'
      })
      
      if (!supabaseUrl) {
        throw new Error('缺少 Supabase URL (SUPABASE_URL)')
      }
      
      if (!supabaseKey) {
        throw new Error('缺少 Supabase API Key (SUPABASE_ANON_KEY)')
      }

      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })

      // 初始化迁移管理器
      this.migrationManager = new MigrationManager(this)

      // 测试连接 - 使用 Supabase 内置的连接测试
      console.log('🔍 测试 Supabase 连接...')
      try {
        // 使用简单的 RPC 调用测试连接
        const { data, error } = await this.client.rpc('version')
        if (error && error.code !== '42883') { // 42883 = function does not exist, 这是正常的
          console.error('❌ Supabase 连接测试失败:', error)
          throw error
        }
        // 如果没有 version 函数，尝试一个基本查询
        if (error && error.code === '42883') {
          const { error: testError } = await this.client
            .from('pg_stat_database')
            .select('datname')
            .limit(1)
          
          if (testError) {
            console.error('❌ Supabase 基本查询测试失败:', testError)
            throw testError
          }
        }
      } catch (connectionError) {
        console.error('❌ Supabase 连接测试异常:', connectionError)
        throw connectionError
      }

      console.log('✅ Supabase 数据库连接成功')
    } catch (error) {
      console.error('❌ Supabase 连接详细错误:', error)
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

  // ==========================================
  // 基础 CRUD 操作 - 这些是适配器应该提供的核心功能
  // ==========================================

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
    
    let query = this.client.from(table).delete({ count: 'exact' })
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { count, error } = await query
    
    if (error) {
      throw new DatabaseQueryError(`删除记录失败: ${table}`, error)
    }
    
    return count || 0
  }

  // ==========================================
  // 批量操作
  // ==========================================

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
    
    let query = this.client.from(table).update(data, { count: 'exact' })
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { count, error } = await query
    
    if (error) {
      throw new DatabaseQueryError(`批量更新记录失败: ${table}`, error)
    }
    
    return count || 0
  }

  async deleteMany(table: string, where: Record<string, any>): Promise<number> {
    if (!this.client) throw new DatabaseConnectionError('数据库未连接')
    
    let query = this.client.from(table).delete({ count: 'exact' })
    
    for (const [key, value] of Object.entries(where)) {
      query = query.eq(key, value)
    }
    
    const { count, error } = await query
    
    if (error) {
      throw new DatabaseQueryError(`批量删除记录失败: ${table}`, error)
    }
    
    return count || 0
  }

  // ==========================================
  // 高级查询
  // ==========================================

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

  // ==========================================
  // 数据库管理操作 - 使用统一的迁移管理器
  // ==========================================

  async migrate(): Promise<void> {
    if (!this.migrationManager) {
      throw new DatabaseConnectionError('迁移管理器未初始化')
    }
    
    await this.migrationManager.migrate()
  }

  async seed(): Promise<void> {
    console.log('Supabase 数据填充完成')
  }
}

// ==========================================
// 注意：
// 1. 移除了所有业务相关方法：createUser, getUserById, createApiKey 等
// 2. 使用统一的 MigrationManager 处理数据库迁移
// 3. 只保留纯粹的数据访问功能
// 4. 业务逻辑现在由 Repository 层处理
// ==========================================