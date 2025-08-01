// 缓存接口定义
export interface CacheAdapter {
  // 连接管理
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  
  // 基础操作
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<boolean>
  exists(key: string): Promise<boolean>
  
  // 批量操作
  mget<T>(keys: string[]): Promise<(T | null)[]>
  mset<T>(items: { key: string; value: T; ttl?: number }[]): Promise<void>
  mdel(keys: string[]): Promise<number>
  
  // 高级操作
  increment(key: string, delta?: number): Promise<number>
  decrement(key: string, delta?: number): Promise<number>
  expire(key: string, ttl: number): Promise<boolean>
  ttl(key: string): Promise<number>
  
  // 模式匹配
  keys(pattern: string): Promise<string[]>
  scan(cursor: number, pattern?: string, count?: number): Promise<{ cursor: number; keys: string[] }>
  
  // 清理操作
  clear(): Promise<void>
  flushAll(): Promise<void>
  
  // 锁操作
  lock(key: string, ttl: number, retries?: number): Promise<CacheLock | null>
  
  // 发布订阅 (可选)
  publish?(channel: string, message: any): Promise<number>
  subscribe?(channel: string, callback: (message: any) => void): Promise<void>
  unsubscribe?(channel: string): Promise<void>
}

export interface CacheLock {
  key: string
  value: string
  ttl: number
  release(): Promise<boolean>
  extend(ttl: number): Promise<boolean>
}

export interface CacheConfig {
  type: 'memory' | 'redis'
  url?: string
  options?: {
    maxMemory?: number
    defaultTtl?: number
    keyPrefix?: string
    serializer?: 'json' | 'msgpack'
    compression?: boolean
    [key: string]: any
  }
}

// 内存缓存特定配置
export interface MemoryCacheOptions {
  maxSize?: number
  maxAge?: number
  updateAgeOnGet?: boolean
  updateAgeOnHas?: boolean
}

// Redis 特定配置
export interface RedisCacheOptions {
  host?: string
  port?: number
  password?: string
  db?: number
  keyPrefix?: string
  retryDelayOnFailover?: number
  maxRetriesPerRequest?: number
}

// 错误类型
export class CacheError extends Error {
  constructor(message: string, public code?: string, public cause?: Error) {
    super(message)
    this.name = 'CacheError'
  }
}

export class CacheConnectionError extends CacheError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause)
    this.name = 'CacheConnectionError'
  }
}

export class CacheLockError extends CacheError {
  constructor(message: string, cause?: Error) {
    super(message, 'LOCK_ERROR', cause)
    this.name = 'CacheLockError'
  }
}