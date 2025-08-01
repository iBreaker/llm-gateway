import type {
  CacheAdapter,
  CacheConfig,
  CacheLock,
  MemoryCacheOptions,
  CacheConnectionError,
  CacheLockError
} from '../../interfaces/cache'

interface CacheItem<T> {
  value: T
  expiresAt?: number
  createdAt: number
  accessedAt: number
}

interface LockItem {
  key: string
  value: string
  expiresAt: number
  ownerId: string
}

export class MemoryCacheAdapter implements CacheAdapter {
  private cache = new Map<string, CacheItem<any>>()
  private locks = new Map<string, LockItem>()
  private cleanupInterval?: NodeJS.Timeout
  private connected = false
  private config: CacheConfig
  private lockCounter = 0

  constructor(config: CacheConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      this.connected = true
      
      // 启动定期清理过期项
      this.cleanupInterval = setInterval(() => {
        this.cleanup()
      }, 60000) // 每分钟清理一次

      // 设置内存使用限制监控
      const options = this.config.options as MemoryCacheOptions
      if (options?.maxSize) {
        this.enforceMaxSize(options.maxSize)
      }
    } catch (error) {
      throw new CacheConnectionError('内存缓存连接失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }

    this.cache.clear()
    this.locks.clear()
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) throw new CacheConnectionError('缓存未连接')

    const item = this.cache.get(key)
    if (!item) return null

    // 检查是否过期
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return null
    }

    // 更新访问时间
    const options = this.config.options as MemoryCacheOptions
    if (options?.updateAgeOnGet !== false) {
      item.accessedAt = Date.now()
    }

    return item.value as T
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.connected) throw new CacheConnectionError('缓存未连接')

    const now = Date.now()
    const item: CacheItem<T> = {
      value,
      createdAt: now,
      accessedAt: now,
      expiresAt: ttl ? now + ttl * 1000 : undefined
    }

    this.cache.set(key, item)

    // 检查内存限制
    const options = this.config.options as MemoryCacheOptions
    if (options?.maxSize && this.cache.size > options.maxSize) {
      this.evictLRU()
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.connected) throw new CacheConnectionError('缓存未连接')
    return this.cache.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) throw new CacheConnectionError('缓存未连接')

    const item = this.cache.get(key)
    if (!item) return false

    // 检查是否过期
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.cache.delete(key)
      return false
    }

    // 更新访问时间
    const options = this.config.options as MemoryCacheOptions
    if (options?.updateAgeOnHas !== false) {
      item.accessedAt = Date.now()
    }

    return true
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const results: (T | null)[] = []
    for (const key of keys) {
      results.push(await this.get<T>(key))
    }
    return results
  }

  async mset<T>(items: { key: string; value: T; ttl?: number }[]): Promise<void> {
    for (const item of items) {
      await this.set(item.key, item.value, item.ttl)
    }
  }

  async mdel(keys: string[]): Promise<number> {
    let deleted = 0
    for (const key of keys) {
      if (await this.delete(key)) {
        deleted++
      }
    }
    return deleted
  }

  async increment(key: string, delta = 1): Promise<number> {
    const current = await this.get<number>(key)
    const newValue = (current || 0) + delta
    await this.set(key, newValue)
    return newValue
  }

  async decrement(key: string, delta = 1): Promise<number> {
    return this.increment(key, -delta)
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const item = this.cache.get(key)
    if (!item) return false

    item.expiresAt = Date.now() + ttl * 1000
    return true
  }

  async ttl(key: string): Promise<number> {
    const item = this.cache.get(key)
    if (!item) return -2 // 键不存在

    if (!item.expiresAt) return -1 // 无过期时间

    const remaining = Math.ceil((item.expiresAt - Date.now()) / 1000)
    return remaining > 0 ? remaining : -2
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = this.globToRegex(pattern)
    return Array.from(this.cache.keys()).filter(key => regex.test(key))
  }

  async scan(cursor: number, pattern?: string, count = 10): Promise<{ cursor: number; keys: string[] }> {
    const allKeys = Array.from(this.cache.keys())
    const filteredKeys = pattern 
      ? allKeys.filter(key => this.globToRegex(pattern).test(key))
      : allKeys

    const start = cursor
    const end = Math.min(start + count, filteredKeys.length)
    const keys = filteredKeys.slice(start, end)
    const nextCursor = end >= filteredKeys.length ? 0 : end

    return { cursor: nextCursor, keys }
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.locks.clear()
  }

  async flushAll(): Promise<void> {
    await this.clear()
  }

  async lock(key: string, ttl: number, retries = 3): Promise<CacheLock | null> {
    const lockKey = `lock:${key}`
    const lockValue = `${process.pid}_${++this.lockCounter}_${Date.now()}`
    const expiresAt = Date.now() + ttl * 1000

    for (let i = 0; i < retries; i++) {
      if (!this.locks.has(lockKey) || this.isLockExpired(lockKey)) {
        this.locks.set(lockKey, {
          key: lockKey,
          value: lockValue,
          expiresAt,
          ownerId: lockValue
        })

        return new MemoryCacheLock(lockKey, lockValue, ttl, this)
      }

      // 等待一段时间后重试
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    return null
  }

  // 内部方法
  private cleanup(): void {
    const now = Date.now()
    
    // 清理过期的缓存项
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && now > item.expiresAt) {
        this.cache.delete(key)
      }
    }

    // 清理过期的锁
    for (const [key, lock] of this.locks.entries()) {
      if (now > lock.expiresAt) {
        this.locks.delete(key)
      }
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [key, item] of this.cache.entries()) {
      if (item.accessedAt < oldestTime) {
        oldestTime = item.accessedAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  private enforceMaxSize(maxSize: number): void {
    while (this.cache.size > maxSize) {
      this.evictLRU()
    }
  }

  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${escaped}$`)
  }

  private isLockExpired(lockKey: string): boolean {
    const lock = this.locks.get(lockKey)
    return !lock || Date.now() > lock.expiresAt
  }

  // 供 MemoryCacheLock 使用的方法
  releaseLock(lockKey: string, lockValue: string): boolean {
    const lock = this.locks.get(lockKey)
    if (lock && lock.value === lockValue) {
      this.locks.delete(lockKey)
      return true
    }
    return false
  }

  extendLock(lockKey: string, lockValue: string, ttl: number): boolean {
    const lock = this.locks.get(lockKey)
    if (lock && lock.value === lockValue) {
      lock.expiresAt = Date.now() + ttl * 1000
      return true
    }
    return false
  }
}

class MemoryCacheLock implements CacheLock {
  constructor(
    public key: string,
    public value: string,
    public ttl: number,
    private adapter: MemoryCacheAdapter
  ) {}

  async release(): Promise<boolean> {
    return this.adapter.releaseLock(this.key, this.value)
  }

  async extend(ttl: number): Promise<boolean> {
    this.ttl = ttl
    return this.adapter.extendLock(this.key, this.value, ttl)
  }
}