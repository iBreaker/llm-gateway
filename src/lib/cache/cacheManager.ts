/**
 * 缓存管理器
 * 提供多层缓存策略，优化数据库查询性能
 */

import { secureLog } from '@/lib/utils/secure-logger'

export interface CacheConfig {
  ttl: number // 缓存时间(秒)
  maxSize: number // 最大缓存条目数
  prefix: string // 缓存key前缀
}

export interface CacheItem<T> {
  data: T
  expiry: number
  createdAt: number
  accessCount: number
  lastAccess: number
}

export class CacheManager {
  private cache = new Map<string, CacheItem<any>>()
  private config: CacheConfig
  private cleanupInterval?: NodeJS.Timeout

  constructor(config: CacheConfig) {
    this.config = config
    this.startCleanupInterval()
  }

  /**
   * 获取缓存值
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key)
    const item = this.cache.get(fullKey)

    if (!item) {
      return null
    }

    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(fullKey)
      return null
    }

    // 更新访问统计
    item.accessCount++
    item.lastAccess = Date.now()

    return item.data as T
  }

  /**
   * 设置缓存值
   */
  async set<T>(key: string, data: T, customTtl?: number): Promise<void> {
    const fullKey = this.getFullKey(key)
    const ttl = customTtl || this.config.ttl
    const now = Date.now()

    // 检查缓存大小限制
    if (this.cache.size >= this.config.maxSize && !this.cache.has(fullKey)) {
      this.evictLRU()
    }

    const item: CacheItem<T> = {
      data,
      expiry: now + (ttl * 1000),
      createdAt: now,
      accessCount: 0,
      lastAccess: now
    }

    this.cache.set(fullKey, item)
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key)
    return this.cache.delete(fullKey)
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    this.cache.clear()
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const items = Array.from(this.cache.values())
    const now = Date.now()
    
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate: this.calculateHitRate(),
      averageAge: items.length > 0 ? 
        items.reduce((sum, item) => sum + (now - item.createdAt), 0) / items.length / 1000 : 0,
      totalAccess: items.reduce((sum, item) => sum + item.accessCount, 0),
      expiredItems: items.filter(item => now > item.expiry).length
    }
  }

  /**
   * 检查key是否存在
   */
  async has(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key)
    const item = this.cache.get(fullKey)
    
    if (!item) return false
    
    // 检查是否过期
    if (Date.now() > item.expiry) {
      this.cache.delete(fullKey)
      return false
    }
    
    return true
  }

  /**
   * 批量获取
   */
  async getMultiple<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)))
  }

  /**
   * 批量设置
   */
  async setMultiple<T>(items: Array<{ key: string; data: T; ttl?: number }>): Promise<void> {
    await Promise.all(items.map(item => this.set(item.key, item.data, item.ttl)))
  }

  /**
   * 获取完整缓存key
   */
  private getFullKey(key: string): string {
    return `${this.config.prefix}:${key}`
  }

  /**
   * LRU淘汰策略
   */
  private evictLRU(): void {
    let oldestKey = ''
    let oldestTime = Date.now()

    const entries = Array.from(this.cache.entries())
    for (const [key, item] of entries) {
      if (item.lastAccess < oldestTime) {
        oldestTime = item.lastAccess
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanup(): void {
    const now = Date.now()
    let cleanedCount = 0

    const entries = Array.from(this.cache.entries())
    for (const [key, item] of entries) {
      if (now > item.expiry) {
        this.cache.delete(key)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      secureLog.debug('缓存清理完成', {
        cleanedItems: cleanedCount,
        remainingItems: this.cache.size,
        cachePrefix: this.config.prefix
      })
    }
  }

  /**
   * 计算缓存命中率
   */
  private calculateHitRate(): number {
    const items = Array.from(this.cache.values())
    const totalRequests = items.reduce((sum, item) => sum + item.accessCount, 0)
    
    if (totalRequests === 0) return 0
    
    // 这是一个简化的命中率计算，实际应该跟踪未命中次数
    return totalRequests / (totalRequests + this.cache.size) * 100
  }

  /**
   * 启动定期清理
   */
  private startCleanupInterval(): void {
    // 每5分钟清理一次过期缓存
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  /**
   * 停止清理定时器
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cache.clear()
  }
}

// 预定义的缓存实例
export const userCache = new CacheManager({
  ttl: 300, // 5分钟
  maxSize: 1000,
  prefix: 'user'
})

export const apiKeyCache = new CacheManager({
  ttl: 600, // 10分钟
  maxSize: 2000,
  prefix: 'apikey'
})

export const accountCache = new CacheManager({
  ttl: 180, // 3分钟
  maxSize: 500,
  prefix: 'account'
})

export const credentialCache = new CacheManager({
  ttl: 900, // 15分钟
  maxSize: 100,
  prefix: 'credential'
})

// 缓存键生成工具
export class CacheKeys {
  static user(userId: string | bigint): string {
    return `user:${userId.toString()}`
  }

  static apiKey(keyId: string | bigint): string {
    return `apikey:${keyId.toString()}`
  }

  static userApiKeys(userId: string | bigint): string {
    return `user_apikeys:${userId.toString()}`
  }

  static upstreamAccount(accountId: string | bigint): string {
    return `account:${accountId.toString()}`
  }

  static userAccounts(userId: string | bigint): string {
    return `user_accounts:${userId.toString()}`
  }

  static accountCredentials(accountId: string | bigint): string {
    return `credentials:${accountId.toString()}`
  }

  static accountStats(accountId: string | bigint): string {
    return `account_stats:${accountId.toString()}`
  }

  static usageStats(userId: string | bigint, period: string): string {
    return `usage:${userId.toString()}:${period}`
  }
}