import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs/promises'
import type {
  DatabaseAdapter,
  DatabaseTransaction,
  DatabaseConfig,
  SqliteConfig,
  QueryOptions
} from '../../interfaces/database'
import {
  DatabaseConnectionError,
  DatabaseQueryError,
  DatabaseTransactionError
} from '../../interfaces/database'

export class SqliteAdapter implements DatabaseAdapter {
  private db?: Database.Database
  private config: SqliteConfig

  constructor(config: DatabaseConfig) {
    this.config = config as SqliteConfig
  }

  async connect(): Promise<void> {
    try {
      // 确定数据库文件路径
      let dbPath = this.config.url.replace('sqlite:', '').replace('file:', '')
      
      // 处理相对路径
      if (!path.isAbsolute(dbPath)) {
        dbPath = path.resolve(process.cwd(), dbPath)
      }
      
      // 确保目录存在
      const dir = path.dirname(dbPath)
      await fs.mkdir(dir, { recursive: true })

      this.db = new Database(dbPath, {
        verbose: this.config.options?.verbose ? console.log : undefined,
        fileMustExist: false,
        timeout: this.config.options?.connectionTimeout || 5000,
      })

      // 设置 WAL 模式以提高并发性能
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('cache_size = 1000')
      this.db.pragma('temp_store = memory')

      // 启用外键约束
      this.db.pragma('foreign_keys = ON')

      console.log(`✅ SQLite 数据库连接成功: ${dbPath}`)
    } catch (error) {
      throw new DatabaseConnectionError('连接 SQLite 数据库失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = undefined
      console.log('SQLite 数据库连接已关闭')
    }
  }

  isConnected(): boolean {
    return !!this.db && this.db.open
  }

  async transaction<T>(callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')

    try {
      return this.db.transaction(() => {
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
        
        return callback(tx)
      })()
    } catch (error) {
      throw new DatabaseQueryError('事务执行失败', error as Error)
    }
  }

  // 基础 CRUD 操作
  async findOne<T>(table: string, where: Record<string, any>): Promise<T | null> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
    const values = Object.values(where)
    
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`)
    const result = stmt.get(...values)
    
    return result ? result as T : null
  }

  async findMany<T>(table: string, where?: Record<string, any>, options?: QueryOptions): Promise<T[]> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    let sql = `SELECT * FROM ${table}`
    const values: any[] = []
    
    if (where && Object.keys(where).length > 0) {
      const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
      sql += ` WHERE ${whereClause}`
      values.push(...Object.values(where))
    }
    
    if (options?.orderBy && options.orderBy.length > 0) {
      const orderClause = options.orderBy
        .map(order => `${order.field} ${order.direction.toUpperCase()}`)
        .join(', ')
      sql += ` ORDER BY ${orderClause}`
    }
    
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`
    }
    
    if (options?.offset) {
      sql += ` OFFSET ${options.offset}`
    }
    
    const stmt = this.db.prepare(sql)
    const results = stmt.all(...values)
    
    return results as T[]
  }

  async create<T>(table: string, data: Record<string, any>): Promise<T> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map(() => '?').join(', ')
    
    const stmt = this.db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`)
    const result = stmt.run(...values)
    
    // 返回插入的记录
    const selectStmt = this.db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`)
    return selectStmt.get(result.lastInsertRowid) as T
  }

  async update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ')
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    
    const stmt = this.db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`)
    stmt.run(...values)
    
    // 返回更新后的记录
    return this.findOne<T>(table, where) as Promise<T>
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
    const values = Object.values(where)
    
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${whereClause}`)
    const result = stmt.run(...values)
    
    return result.changes
  }

  async createMany<T>(table: string, data: Record<string, any>[]): Promise<T[]> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    if (data.length === 0) return []
    
    const keys = Object.keys(data[0])
    const placeholders = keys.map(() => '?').join(', ')
    
    const stmt = this.db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`)
    const results: T[] = []
    
    for (const item of data) {
      const result = stmt.run(...Object.values(item))
      const selectStmt = this.db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`)
      results.push(selectStmt.get(result.lastInsertRowid) as T)
    }
    
    return results
  }

  async updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ')
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    
    const stmt = this.db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`)
    const result = stmt.run(...values)
    
    return result.changes
  }

  async deleteMany(table: string, where: Record<string, any>): Promise<number> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
    const values = Object.values(where)
    
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${whereClause}`)
    const result = stmt.run(...values)
    
    return result.changes
  }

  async count(table: string, where?: Record<string, any>): Promise<number> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    let sql = `SELECT COUNT(*) as count FROM ${table}`
    const values: any[] = []
    
    if (where && Object.keys(where).length > 0) {
      const whereClause = Object.keys(where).map(key => `${key} = ?`).join(' AND ')
      sql += ` WHERE ${whereClause}`
      values.push(...Object.values(where))
    }
    
    const stmt = this.db.prepare(sql)
    const result = stmt.get(...values) as { count: number }
    
    return result.count
  }

  async exists(table: string, where: Record<string, any>): Promise<boolean> {
    const count = await this.count(table, where)
    return count > 0
  }

  async raw<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')
    
    try {
      const stmt = this.db.prepare(sql)
      
      if (sql.trim().toLowerCase().startsWith('select')) {
        return stmt.all(...(params || [])) as T[]
      } else {
        stmt.run(...(params || []))
        return [] as T[]
      }
    } catch (error) {
      throw new DatabaseQueryError(`SQL 执行失败: ${sql}`, error as Error)
    }
  }

  async migrate(): Promise<void> {
    if (!this.db) throw new DatabaseConnectionError('数据库未连接')

    try {
      // 创建用户表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 创建 API 密钥表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          key_hash TEXT UNIQUE NOT NULL,
          permissions TEXT DEFAULT '[]',
          is_active BOOLEAN DEFAULT 1,
          expires_at DATETIME,
          last_used_at DATETIME,
          request_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `)

      // 创建上游账号表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS upstream_accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          email TEXT NOT NULL,
          credentials TEXT NOT NULL,
          is_active BOOLEAN DEFAULT 1,
          priority INTEGER DEFAULT 1,
          weight INTEGER DEFAULT 100,
          last_used_at DATETIME,
          request_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // 创建使用记录表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS usage_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key_id INTEGER NOT NULL,
          upstream_account_id INTEGER,
          request_id TEXT UNIQUE NOT NULL,
          method TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          status_code INTEGER,
          response_time INTEGER,
          tokens_used INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
          FOREIGN KEY (upstream_account_id) REFERENCES upstream_accounts(id) ON DELETE SET NULL
        )
      `)

      // 创建索引
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`)
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`)
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_upstream_accounts_type ON upstream_accounts(type)`)
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_records_api_key_id ON usage_records(api_key_id)`)
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_records_created_at ON usage_records(created_at)`)

      console.log('✅ SQLite 数据库迁移完成')
    } catch (error) {
      throw new DatabaseQueryError('数据库迁移失败', error as Error)
    }
  }

  async seed(): Promise<void> {
    // 数据填充的具体实现
    console.log('SQLite 数据填充完成')
  }

  async healthCheck(): Promise<{ status: string; connected: boolean; latency?: number }> {
    if (!this.db) {
      return { status: 'disconnected', connected: false }
    }

    try {
      const startTime = Date.now()
      this.db.prepare('SELECT 1').get()
      const latency = Date.now() - startTime
      
      return { 
        status: 'healthy', 
        connected: true, 
        latency 
      }
    } catch (error) {
      return { 
        status: 'error', 
        connected: false 
      }
    }
  }
}