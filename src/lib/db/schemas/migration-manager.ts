import { readFileSync } from 'fs'
import { join } from 'path'
import type { DatabaseAdapter } from '../../interfaces/database'

/**
 * 统一的数据库迁移管理器
 * 负责执行数据库结构迁移，支持所有数据库适配器
 */
export class MigrationManager {
  private adapter: DatabaseAdapter
  private schemasPath: string

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter
    this.schemasPath = join(__dirname, '.')
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
      
      // 1. 创建表结构
      await this.executeSqlFile('tables.sql')
      console.log('✅ 表结构创建完成')
      
      // 2. 创建索引
      await this.executeSqlFile('indexes.sql')
      console.log('✅ 索引创建完成')
      
      // 3. 创建触发器
      await this.executeSqlFile('triggers.sql')
      console.log('✅ 触发器创建完成')
      
      console.log('🎉 数据库迁移完成')
    } catch (error) {
      console.error('❌ 数据库迁移失败:', error)
      throw error
    }
  }

  /**
   * 执行指定的 SQL 文件
   */
  private async executeSqlFile(filename: string): Promise<void> {
    const filePath = join(this.schemasPath, filename)
    const sql = readFileSync(filePath, 'utf-8')
    
    // 按分号分割 SQL 语句
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    // 依次执行每个 SQL 语句
    for (const statement of statements) {
      if (statement.trim()) {
        await this.adapter.raw(statement)
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