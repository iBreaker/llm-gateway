// 适配器工厂
import type { DatabaseAdapter, DatabaseConfig } from '../interfaces/database'
import type { CacheAdapter, CacheConfig } from '../interfaces/cache'
import type { FileAdapter, FileConfig } from '../interfaces/file'

// 数据库适配器工厂
export async function createDatabaseAdapter(
  config: DatabaseConfig,
  fileAdapter?: FileAdapter
): Promise<DatabaseAdapter> {
  switch (config.type) {
    case 'sqlite': {
      const { SqliteAdapter } = await import('./database/sqlite')
      return new SqliteAdapter(config, fileAdapter)
    }
    case 'postgresql': {
      const { PostgresAdapter } = await import('./database/postgres')
      return new PostgresAdapter(config)
    }
    default:
      throw new Error(`不支持的数据库类型: ${config.type}`)
  }
}

// 缓存适配器工厂
export async function createCacheAdapter(config: CacheConfig): Promise<CacheAdapter> {
  switch (config.type) {
    case 'memory': {
      const { MemoryCacheAdapter } = await import('./cache/memory')
      return new MemoryCacheAdapter(config)
    }
    default:
      throw new Error(`不支持的缓存类型: ${config.type}`)
  }
}

// 文件存储适配器工厂
export async function createFileAdapter(config: FileConfig): Promise<FileAdapter> {
  switch (config.type) {
    case 'local': {
      const { LocalFileAdapter } = await import('./file/local')
      return new LocalFileAdapter(config)
    }
    case 'vercel-blob': {
      const { VercelBlobFileAdapter } = await import('./file/vercel-blob')
      return new VercelBlobFileAdapter(config)
    }
    default:
      throw new Error(`不支持的文件存储类型: ${config.type}`)
  }
}

// 服务管理器
export class ServiceRegistry {
  private static instance: ServiceRegistry
  private database?: DatabaseAdapter
  private cache?: CacheAdapter
  private file?: FileAdapter

  private constructor() {}

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry()
    }
    return ServiceRegistry.instance
  }

  async initializeDatabase(config: DatabaseConfig): Promise<DatabaseAdapter> {
    if (this.database) {
      await this.database.disconnect()
    }
    this.database = await createDatabaseAdapter(config)
    await this.database.connect()
    return this.database
  }

  async initializeDatabaseWithFile(config: DatabaseConfig, fileAdapter: FileAdapter): Promise<DatabaseAdapter> {
    if (this.database) {
      await this.database.disconnect()
    }
    this.database = await createDatabaseAdapter(config, fileAdapter)
    await this.database.connect()
    return this.database
  }

  async initializeCache(config: CacheConfig): Promise<CacheAdapter> {
    if (this.cache) {
      await this.cache.disconnect()
    }
    this.cache = await createCacheAdapter(config)
    await this.cache.connect()
    return this.cache
  }

  async initializeFile(config: FileConfig): Promise<FileAdapter> {
    if (this.file) {
      await this.file.disconnect()
    }
    this.file = await createFileAdapter(config)
    await this.file.connect()
    return this.file
  }

  getDatabase(): DatabaseAdapter {
    if (!this.database) {
      throw new Error('数据库适配器未初始化')
    }
    return this.database
  }

  getCache(): CacheAdapter {
    if (!this.cache) {
      throw new Error('缓存适配器未初始化')
    }
    return this.cache
  }

  getFile(): FileAdapter {
    if (!this.file) {
      throw new Error('文件适配器未初始化')
    }
    return this.file
  }

  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = []
    
    if (this.database) {
      promises.push(this.database.disconnect())
    }
    if (this.cache) {
      promises.push(this.cache.disconnect())
    }
    if (this.file) {
      promises.push(this.file.disconnect())
    }

    await Promise.all(promises)
  }
}

// 便捷的获取方法
export const db = () => ServiceRegistry.getInstance().getDatabase()
export const cache = () => ServiceRegistry.getInstance().getCache()
export const file = () => ServiceRegistry.getInstance().getFile()