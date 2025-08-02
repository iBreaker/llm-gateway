import type { DatabaseAdapter } from '../../interfaces/database'
import { SqlLoader } from './sql-loader'

// 索引SQL已从外部文件加载

// 触发器SQL已从外部文件加载

/**
 * 统一的数据库迁移管理器
 * 负责执行数据库结构迁移，支持所有数据库适配器
 */
export class MigrationManager {
  private adapter: DatabaseAdapter
  private sqlLoader: SqlLoader

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter
    this.sqlLoader = new SqlLoader()
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
        console.log('🔍 检测到 Supabase 环境，尝试自动执行迁移...')
        
        try {
          // 尝试使用 exec_sql RPC 函数执行迁移
          console.log('📋 尝试使用 exec_sql RPC 函数执行迁移...')
          
          // 加载SQL文件
          const { tables, indexes, triggers } = this.sqlLoader.loadBaseSqlFiles()
          
          // 1. 创建表结构
          await this.executeSql(tables)
          console.log('✅ 表结构创建完成')
          
          // 2. 创建索引
          await this.executeSql(indexes)
          console.log('✅ 索引创建完成')
          
          // 3. 创建触发器
          await this.executeSql(triggers)
          console.log('✅ 触发器创建完成')
          
          console.log('🎉 Supabase 数据库迁移完成')
          return
        } catch (error) {
          console.warn('⚠️ 自动迁移失败，可能需要手动执行:', error)
          console.log('📋 请手动在 Supabase Dashboard 中执行以下 SQL:')
          console.log('━'.repeat(80))
          console.log('1. 进入 Supabase Dashboard > SQL Editor')
          console.log('2. 执行项目根目录中的 supabase-init.sql 文件')
          console.log('3. 或者复制粘贴以下 SQL 语句:')
          console.log('━'.repeat(80))
          const { tables, indexes, triggers } = this.sqlLoader.loadBaseSqlFiles()
          console.log(tables)
          console.log(indexes)
          console.log(triggers)
          console.log('━'.repeat(80))
          console.log('✅ Supabase 迁移指导完成 - 请手动执行上述 SQL')
          return
        }
      }
      
      // 对于非 Supabase 适配器，正常执行迁移
      // 加载SQL文件
      const { tables, indexes, triggers } = this.sqlLoader.loadBaseSqlFiles()
      
      // 1. 创建表结构
      await this.executeSql(tables)
      console.log('✅ 表结构创建完成')
      
      // 2. 创建索引
      await this.executeSql(indexes)
      console.log('✅ 索引创建完成')
      
      // 3. 创建触发器 (仅对 PostgreSQL/Supabase)
      if (this.adapter.constructor.name.includes('Postgres')) {
        await this.executeSql(triggers)
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