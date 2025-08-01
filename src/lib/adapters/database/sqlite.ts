import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import type {
  DatabaseAdapter,
  DatabaseTransaction,
  DatabaseConfig,
  SqliteConfig,
  QueryOptions,
  ConnectionError,
  QueryError
} from '../../interfaces/database'
import type { StorageAdapter } from '../../interfaces/storage'

export class SqliteAdapter implements DatabaseAdapter {
  private db?: Database.Database
  private config: SqliteConfig
  private storageAdapter?: StorageAdapter
  private localDbPath?: string
  private syncInterval?: NodeJS.Timeout
  private lastSyncTime = 0

  constructor(config: DatabaseConfig, storageAdapter?: StorageAdapter) {
    this.config = config as SqliteConfig
    this.storageAdapter = storageAdapter
  }

  async connect(): Promise<void> {
    try {
      // 确定数据库文件路径
      let dbPath = this.config.url.replace('sqlite:', '').replace('file:', '')
      
      // 如果启用 Blob 存储，从 Blob 下载到临时目录
      if (this.config.blob?.enabled && this.storageAdapter) {
        await this.downloadFromBlob()
        dbPath = this.localDbPath!
      } else {
        // 本地文件，确保目录存在
        const dir = path.dirname(dbPath)
        await fs.mkdir(dir, { recursive: true })
      }

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

      // 启动定期同步到 Blob（如果启用）
      if (this.config.blob?.enabled && this.storageAdapter) {
        this.startSyncInterval()
      }
    } catch (error) {
      throw new ConnectionError('连接 SQLite 数据库失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    // 停止同步定时器
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = undefined
    }

    // 最后一次同步到 Blob
    if (this.config.blob?.enabled && this.storageAdapter && this.localDbPath) {
      try {
        await this.uploadToBlob()
      } catch (error) {
        console.warn('断开连接时同步数据库到 Blob 失败:', error)
      }
    }

    if (this.db) {
      this.db.close()
      this.db = undefined
    }

    // 清理临时文件
    if (this.localDbPath && this.config.blob?.enabled) {
      try {
        await fs.unlink(this.localDbPath)
        // 清理 WAL 和 SHM 文件
        await fs.unlink(this.localDbPath + '-wal').catch(() => {})
        await fs.unlink(this.localDbPath + '-shm').catch(() => {})
      } catch (error) {
        console.warn('清理临时数据库文件失败:', error)
      }
      this.localDbPath = undefined
    }
  }

  isConnected(): boolean {
    return this.db?.open || false
  }

  async transaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    const transaction = this.db.transaction(async () => {
      const tx = new SqliteTransaction(this.db!)
      return await fn(tx)
    })

    try {
      return transaction()
    } catch (error) {
      throw new QueryError('事务执行失败', error as Error)
    }
  }

  async findOne<T>(table: string, where: Record<string, any>): Promise<T | null> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      const { whereClause, params } = this.buildWhereClause(where)
      const sql = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`
      const result = this.db.prepare(sql).get(params) as T | undefined
      return result || null
    } catch (error) {
      throw new QueryError(`查询 ${table} 表失败`, error as Error)
    }
  }

  async findMany<T>(table: string, where?: Record<string, any>, options?: QueryOptions): Promise<T[]> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      let sql = `SELECT ${options?.select?.join(', ') || '*'} FROM ${table}`
      let params: any[] = []

      if (where && Object.keys(where).length > 0) {
        const { whereClause, params: whereParams } = this.buildWhereClause(where)
        sql += ` WHERE ${whereClause}`
        params = whereParams
      }

      if (options?.orderBy?.length) {
        const orderClauses = options.orderBy.map(
          order => `${order.field} ${order.direction.toUpperCase()}`
        )
        sql += ` ORDER BY ${orderClauses.join(', ')}`
      }

      if (options?.limit) {
        sql += ` LIMIT ${options.limit}`
      }

      if (options?.offset) {
        sql += ` OFFSET ${options.offset}`
      }

      return this.db.prepare(sql).all(params) as T[]
    } catch (error) {
      throw new QueryError(`查询 ${table} 表失败`, error as Error)
    }
  }

  async create<T>(table: string, data: Record<string, any>): Promise<T> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      const keys = Object.keys(data)
      const placeholders = keys.map(() => '?').join(', ')
      const values = Object.values(data)

      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
      const result = this.db.prepare(sql).get(values) as T
      return result
    } catch (error) {
      throw new QueryError(`插入 ${table} 表失败`, error as Error)
    }
  }

  async update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      const dataKeys = Object.keys(data)
      const setClauses = dataKeys.map(key => `${key} = ?`).join(', ')
      const dataValues = Object.values(data)

      const { whereClause, params: whereParams } = this.buildWhereClause(where)
      const params = [...dataValues, ...whereParams]

      const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClause} RETURNING *`
      const result = this.db.prepare(sql).get(params) as T
      return result
    } catch (error) {
      throw new QueryError(`更新 ${table} 表失败`, error as Error)
    }
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      const { whereClause, params } = this.buildWhereClause(where)
      const sql = `DELETE FROM ${table} WHERE ${whereClause}`
      const result = this.db.prepare(sql).run(params)
      return result.changes
    } catch (error) {
      throw new QueryError(`删除 ${table} 表记录失败`, error as Error)
    }
  }

  async createMany<T>(table: string, data: Record<string, any>[]): Promise<T[]> {
    if (!data.length) return []

    return this.transaction(async (tx) => {
      const results: T[] = []
      for (const item of data) {
        const result = await tx.create<T>(table, item)
        results.push(result)
      }
      return results
    })
  }

  async updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      const dataKeys = Object.keys(data)
      const setClauses = dataKeys.map(key => `${key} = ?`).join(', ')
      const dataValues = Object.values(data)

      const { whereClause, params: whereParams } = this.buildWhereClause(where)
      const params = [...dataValues, ...whereParams]

      const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClause}`
      const result = this.db.prepare(sql).run(params)
      return result.changes
    } catch (error) {
      throw new QueryError(`批量更新 ${table} 表失败`, error as Error)
    }
  }

  async deleteMany(table: string, where: Record<string, any>): Promise<number> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      const { whereClause, params } = this.buildWhereClause(where)
      const sql = `DELETE FROM ${table} WHERE ${whereClause}`
      const result = this.db.prepare(sql).run(params)
      return result.changes
    } catch (error) {
      throw new QueryError(`批量删除 ${table} 表记录失败`, error as Error)
    }
  }

  async count(table: string, where?: Record<string, any>): Promise<number> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      let sql = `SELECT COUNT(*) as count FROM ${table}`
      let params: any[] = []

      if (where && Object.keys(where).length > 0) {
        const { whereClause, params: whereParams } = this.buildWhereClause(where)
        sql += ` WHERE ${whereClause}`
        params = whereParams
      }

      const result = this.db.prepare(sql).get(params) as { count: number }
      return result.count
    } catch (error) {
      throw new QueryError(`统计 ${table} 表记录失败`, error as Error)
    }
  }

  async exists(table: string, where: Record<string, any>): Promise<boolean> {
    const count = await this.count(table, where)
    return count > 0
  }

  async raw<T>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new ConnectionError('数据库未连接')

    try {
      if (sql.trim().toLowerCase().startsWith('select')) {
        return this.db.prepare(sql).all(params || []) as T[]
      } else {
        this.db.prepare(sql).run(params || [])
        return []
      }
    } catch (error) {
      throw new QueryError('执行原生 SQL 失败', error as Error)
    }
  }

  async migrate(): Promise<void> {
    // 这里可以实现数据库迁移逻辑
    // 暂时留空，后续实现
  }

  async seed(): Promise<void> {
    // 这里可以实现数据库种子数据逻辑
    // 暂时留空，后续实现
  }

  private buildWhereClause(where: Record<string, any>): { whereClause: string; params: any[] } {
    const conditions: string[] = []
    const params: any[] = []

    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        conditions.push(`${key} IS NULL`)
      } else if (Array.isArray(value)) {
        const placeholders = value.map(() => '?').join(', ')
        conditions.push(`${key} IN (${placeholders})`)
        params.push(...value)
      } else {
        conditions.push(`${key} = ?`)
        params.push(value)
      }
    }

    return {
      whereClause: conditions.join(' AND '),
      params
    }
  }

  // Blob 存储相关方法
  private async downloadFromBlob(): Promise<void> {
    if (!this.storageAdapter || !this.config.blob?.key) {
      throw new Error('存储适配器或 Blob 配置未提供')
    }

    try {
      // 创建临时文件路径
      const tempDir = os.tmpdir()
      this.localDbPath = path.join(tempDir, `llmgw-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)

      // 尝试从 Blob 下载数据库文件
      const file = await this.storageAdapter.get(this.config.blob.key)
      
      if (file) {
        // 如果文件存在，写入临时位置
        await fs.writeFile(this.localDbPath, file.data)
        console.log(`✅ 从 Blob 下载数据库文件到: ${this.localDbPath}`)
      } else {
        // 如果文件不存在，创建空数据库文件
        await fs.writeFile(this.localDbPath, '')
        console.log(`📝 创建新的数据库文件: ${this.localDbPath}`)
      }
    } catch (error) {
      console.warn('从 Blob 下载数据库文件失败，将创建新文件:', error)
      
      // 创建临时文件路径
      const tempDir = os.tmpdir()
      this.localDbPath = path.join(tempDir, `llmgw-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
      await fs.writeFile(this.localDbPath, '')
    }
  }

  private async uploadToBlob(): Promise<void> {
    if (!this.storageAdapter || !this.config.blob?.key || !this.localDbPath) {
      return
    }

    try {
      // 确保数据库完全写入磁盘
      if (this.db) {
        this.db.pragma('wal_checkpoint(FULL)')
      }

      // 读取数据库文件
      const dbData = await fs.readFile(this.localDbPath)
      
      // 上传到 Blob
      await this.storageAdapter.put(this.config.blob.key, dbData, {
        contentType: 'application/octet-stream',
        metadata: {
          lastSync: new Date().toISOString(),
          size: dbData.length.toString()
        }
      })

      this.lastSyncTime = Date.now()
      console.log(`✅ 数据库文件已同步到 Blob: ${this.config.blob.key}`)

      // 创建备份（如果配置了备份数量）
      if (this.config.blob.backupCount && this.config.blob.backupCount > 0) {
        await this.createBackup(dbData)
      }
    } catch (error) {
      console.error('上传数据库文件到 Blob 失败:', error)
      throw error
    }
  }

  private async createBackup(dbData: Buffer): Promise<void> {
    if (!this.storageAdapter || !this.config.blob?.key) return

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupKey = `${this.config.blob.key}.backup.${timestamp}`

    try {
      await this.storageAdapter.put(backupKey, dbData, {
        contentType: 'application/octet-stream',
        metadata: {
          originalKey: this.config.blob.key,
          backupTime: new Date().toISOString(),
          size: dbData.length.toString()
        }
      })

      // 清理旧备份
      await this.cleanupOldBackups()
    } catch (error) {
      console.warn('创建数据库备份失败:', error)
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    if (!this.storageAdapter || !this.config.blob?.key || !this.config.blob.backupCount) return

    try {
      // 列出所有备份文件
      const backupPrefix = `${this.config.blob.key}.backup.`
      const files = await this.storageAdapter.list(backupPrefix)
      
      // 按修改时间排序，保留最新的 N 个
      const sortedFiles = files.sort((a, b) => 
        new Date(b.stat.lastModified).getTime() - new Date(a.stat.lastModified).getTime()
      )

      // 删除多余的备份
      const filesToDelete = sortedFiles.slice(this.config.blob.backupCount)
      for (const file of filesToDelete) {
        await this.storageAdapter.delete(file.key)
      }

      if (filesToDelete.length > 0) {
        console.log(`🗑️  清理了 ${filesToDelete.length} 个旧备份`)
      }
    } catch (error) {
      console.warn('清理旧备份失败:', error)
    }
  }

  private startSyncInterval(): void {
    const interval = (this.config.blob?.syncInterval || 300) * 1000 // 默认 5 分钟
    
    this.syncInterval = setInterval(async () => {
      try {
        await this.uploadToBlob()
      } catch (error) {
        console.error('定期同步数据库到 Blob 失败:', error)
      }
    }, interval)

    console.log(`🔄 启动数据库同步，间隔: ${interval / 1000} 秒`)
  }

  // 手动同步方法
  public async syncToBlob(): Promise<void> {
    if (this.config.blob?.enabled && this.storageAdapter) {
      await this.uploadToBlob()
    }
  }
}

class SqliteTransaction implements DatabaseTransaction {
  constructor(private db: Database.Database) {}

  async findOne<T>(table: string, where: Record<string, any>): Promise<T | null> {
    const adapter = new SqliteAdapter({ type: 'sqlite', url: '' })
    // @ts-ignore - 访问私有属性
    adapter.db = this.db
    return adapter.findOne<T>(table, where)
  }

  async findMany<T>(table: string, where?: Record<string, any>, options?: QueryOptions): Promise<T[]> {
    const adapter = new SqliteAdapter({ type: 'sqlite', url: '' })
    // @ts-ignore - 访问私有属性
    adapter.db = this.db
    return adapter.findMany<T>(table, where, options)
  }

  async create<T>(table: string, data: Record<string, any>): Promise<T> {
    const adapter = new SqliteAdapter({ type: 'sqlite', url: '' })
    // @ts-ignore - 访问私有属性
    adapter.db = this.db
    return adapter.create<T>(table, data)
  }

  async update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T> {
    const adapter = new SqliteAdapter({ type: 'sqlite', url: '' })
    // @ts-ignore - 访问私有属性
    adapter.db = this.db
    return adapter.update<T>(table, where, data)
  }

  async delete(table: string, where: Record<string, any>): Promise<number> {
    const adapter = new SqliteAdapter({ type: 'sqlite', url: '' })
    // @ts-ignore - 访问私有属性
    adapter.db = this.db
    return adapter.delete(table, where)
  }

  async raw<T>(sql: string, params?: any[]): Promise<T[]> {
    const adapter = new SqliteAdapter({ type: 'sqlite', url: '' })
    // @ts-ignore - 访问私有属性
    adapter.db = this.db
    return adapter.raw<T>(sql, params)
  }
}