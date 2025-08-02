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

/**
 * 简化的 Supabase 适配器实现
 * 使用 Service Role Key 直接操作数据库，避免 RLS 限制
 */
export class SupabaseSimpleAdapter implements DatabaseAdapter {
  private client: SupabaseClient | null = null
  private config: DatabaseConfig

  constructor(config: DatabaseConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    try {
      // 获取 Supabase URL 和 Service Role Key
      const supabaseUrl = process.env.SUPABASE_URL || this.config.url
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      
      console.log('🔍 Supabase 简化适配器连接配置:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceRoleKey,
        urlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT_SET'
      })
      
      if (!supabaseUrl) {
        throw new Error('缺少 Supabase URL (SUPABASE_URL)')
      }
      
      if (!serviceRoleKey) {
        throw new Error('缺少 Supabase Service Role Key (SUPABASE_SERVICE_ROLE_KEY)')
      }

      // 使用 Service Role Key 创建客户端，绕过 RLS
      this.client = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })

      console.log('✅ Supabase 简化适配器连接成功')
    } catch (error) {
      console.error('❌ Supabase 连接详细错误:', error)
      throw new DatabaseConnectionError('Supabase 连接失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
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
  // 基础 CRUD 操作
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

  // 简化的 raw 方法，不支持任意 SQL 执行
  async raw<T>(sql: string, params?: any[]): Promise<T[]> {
    console.warn('⚠️ Supabase 简化适配器不支持任意 SQL 执行')
    console.log(`SQL: ${sql}`)
    return [] as T[]
  }

  // ==========================================
  // 数据库管理操作
  // ==========================================

  async migrate(): Promise<void> {
    console.log('✅ Supabase 简化适配器: 请手动在 Dashboard 中执行 setup-supabase.md 中的 SQL')
  }

  async seed(): Promise<void> {
    console.log('✅ Supabase 数据填充: 无需额外操作')
  }
}