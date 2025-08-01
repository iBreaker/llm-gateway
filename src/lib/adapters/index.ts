// 适配器工厂
import type { DatabaseAdapter, DatabaseConfig } from '../interfaces/database'
import type { CacheAdapter, CacheConfig } from '../interfaces/cache'
import type { StorageAdapter, StorageConfig } from '../interfaces/storage'

// 数据库适配器工厂
export async function createDatabaseAdapter(
  config: DatabaseConfig,
  storageAdapter?: StorageAdapter
): Promise<DatabaseAdapter> {
  switch (config.type) {
    case 'sqlite': {
      const { SqliteAdapter } = await import('./database/sqlite')
      return new SqliteAdapter(config, storageAdapter)
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
    case 'redis': {
      const { RedisCacheAdapter } = await import('./cache/redis')
      return new RedisCacheAdapter(config)
    }
    default:
      throw new Error(`不支持的缓存类型: ${config.type}`)
  }
}

// 存储适配器工厂
export async function createStorageAdapter(config: StorageConfig): Promise<StorageAdapter> {
  switch (config.type) {
    case 'local': {
      const { LocalStorageAdapter } = await import('./storage/local')
      return new LocalStorageAdapter(config)
    }
    case 'vercel-blob': {
      const { VercelBlobStorageAdapter } = await import('./storage/vercel-blob')
      return new VercelBlobStorageAdapter(config)
    }
    case 's3': {
      const { S3StorageAdapter } = await import('./storage/s3')
      return new S3StorageAdapter(config)
    }
    case 'gcs': {
      const { GcsStorageAdapter } = await import('./storage/gcs')
      return new GcsStorageAdapter(config)
    }
    default:
      throw new Error(`不支持的存储类型: ${config.type}`)
  }
}

// 服务管理器
export class ServiceRegistry {
  private static instance: ServiceRegistry
  private database?: DatabaseAdapter
  private cache?: CacheAdapter
  private storage?: StorageAdapter

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

  async initializeDatabaseWithStorage(config: DatabaseConfig, storageAdapter: StorageAdapter): Promise<DatabaseAdapter> {
    if (this.database) {
      await this.database.disconnect()
    }
    this.database = await createDatabaseAdapter(config, storageAdapter)
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

  async initializeStorage(config: StorageConfig): Promise<StorageAdapter> {
    if (this.storage) {
      await this.storage.disconnect()
    }
    this.storage = await createStorageAdapter(config)
    await this.storage.connect()
    return this.storage
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

  getStorage(): StorageAdapter {
    if (!this.storage) {
      throw new Error('存储适配器未初始化')
    }
    return this.storage
  }

  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = []
    
    if (this.database) {
      promises.push(this.database.disconnect())
    }
    if (this.cache) {
      promises.push(this.cache.disconnect())
    }
    if (this.storage) {
      promises.push(this.storage.disconnect())
    }

    await Promise.all(promises)
  }
}

// 便捷的获取方法
export const db = () => ServiceRegistry.getInstance().getDatabase()
export const cache = () => ServiceRegistry.getInstance().getCache()
export const storage = () => ServiceRegistry.getInstance().getStorage()