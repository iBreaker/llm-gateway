import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

/**
 * SQL文件加载器
 * 负责从文件系统加载SQL文件，并支持数据库类型适配
 */
export class SqlLoader {
  private basePath: string

  constructor(basePath: string = 'src/lib/db/schemas') {
    this.basePath = basePath
  }

  /**
   * 加载SQL文件
   */
  loadSqlFile(filename: string): string {
    try {
      const filePath = join(process.cwd(), this.basePath, filename)
      
      if (!existsSync(filePath)) {
        console.warn(`⚠️ SQL文件不存在: ${filePath}`)
        return ''
      }
      
      const content = readFileSync(filePath, 'utf-8')
      console.log(`✅ 成功加载SQL文件: ${filename}`)
      return content
    } catch (error) {
      console.error(`❌ 加载SQL文件失败 ${filename}:`, error)
      return ''
    }
  }

  /**
   * 加载所有基础SQL文件
   */
  loadBaseSqlFiles(): {
    tables: string
    indexes: string
    triggers: string
  } {
    return {
      tables: this.loadSqlFile('tables.sql'),
      indexes: this.loadSqlFile('indexes.sql'),
      triggers: this.loadSqlFile('triggers.sql')
    }
  }

  /**
   * 加载迁移文件
   */
  loadMigrationFiles(): string[] {
    const migrationsPath = join(process.cwd(), this.basePath, 'migrations')
    
    if (!existsSync(migrationsPath)) {
      console.warn(`⚠️ 迁移目录不存在: ${migrationsPath}`)
      return []
    }

    try {
      // 这里可以扩展为读取目录中的所有.sql文件
      // 目前返回空数组，因为迁移文件在另一个目录
      return []
    } catch (error) {
      console.error('❌ 加载迁移文件失败:', error)
      return []
    }
  }

  /**
   * 根据数据库类型适配SQL
   */
  adaptSqlForDatabase(sql: string, dbType: 'postgresql' | 'mysql' | 'sqlite'): string {
    if (!sql) return ''

    let adaptedSql = sql

    switch (dbType) {
      case 'postgresql':
        // PostgreSQL 已经是标准格式，无需修改
        break
      
      case 'mysql':
        // MySQL 适配
        adaptedSql = adaptedSql
          .replace(/BIGSERIAL/g, 'BIGINT AUTO_INCREMENT')
          .replace(/SERIAL/g, 'INT AUTO_INCREMENT')
          .replace(/JSONB/g, 'JSON')
          .replace(/TIMESTAMPTZ/g, 'TIMESTAMP')
          .replace(/::jsonb/g, '')
          .replace(/gen_random_uuid\(\)/g, 'UUID()')
        break
      
      case 'sqlite':
        // SQLite 适配
        adaptedSql = adaptedSql
          .replace(/BIGSERIAL/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
          .replace(/SERIAL/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
          .replace(/JSONB/g, 'TEXT')
          .replace(/TIMESTAMPTZ/g, 'DATETIME')
          .replace(/::jsonb/g, '')
          .replace(/gen_random_uuid\(\)/g, "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))")
        break
    }

    return adaptedSql
  }

  /**
   * 验证SQL文件是否存在
   */
  validateSqlFiles(): {
    tables: boolean
    indexes: boolean
    triggers: boolean
  } {
    const basePath = join(process.cwd(), this.basePath)
    
    return {
      tables: existsSync(join(basePath, 'tables.sql')),
      indexes: existsSync(join(basePath, 'indexes.sql')),
      triggers: existsSync(join(basePath, 'triggers.sql'))
    }
  }
} 