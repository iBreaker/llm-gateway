// 数据库接口定义
export interface DatabaseAdapter {
  // 连接管理
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  
  // 事务管理
  transaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T>
  
  // 基础 CRUD 操作
  findOne<T>(table: string, where: Record<string, any>): Promise<T | null>
  findMany<T>(table: string, where?: Record<string, any>, options?: QueryOptions): Promise<T[]>
  create<T>(table: string, data: Record<string, any>): Promise<T>
  update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T>
  delete(table: string, where: Record<string, any>): Promise<number>
  
  // 批量操作
  createMany<T>(table: string, data: Record<string, any>[]): Promise<T[]>
  updateMany(table: string, where: Record<string, any>, data: Record<string, any>): Promise<number>
  deleteMany(table: string, where: Record<string, any>): Promise<number>
  
  // 高级查询
  count(table: string, where?: Record<string, any>): Promise<number>
  exists(table: string, where: Record<string, any>): Promise<boolean>
  
  // 原生 SQL 查询 (可选)
  raw<T>(sql: string, params?: any[]): Promise<T[]>
  
  // 数据库特定操作
  migrate(): Promise<void>
  seed(): Promise<void>
  
  // 健康检查
  healthCheck(): Promise<{ status: string; connected: boolean; latency?: number }>
}

export interface DatabaseTransaction {
  findOne<T>(table: string, where: Record<string, any>): Promise<T | null>
  findMany<T>(table: string, where?: Record<string, any>, options?: QueryOptions): Promise<T[]>
  create<T>(table: string, data: Record<string, any>): Promise<T>
  update<T>(table: string, where: Record<string, any>, data: Record<string, any>): Promise<T>
  delete(table: string, where: Record<string, any>): Promise<number>
  raw<T>(sql: string, params?: any[]): Promise<T[]>
}

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: { field: string; direction: 'asc' | 'desc' }[]
  select?: string[]
  include?: string[]
}

export interface DatabaseConfig {
  type: 'sqlite' | 'prisma'
  url: string
  options?: {
    maxConnections?: number
    connectionTimeout?: number
    queryTimeout?: number
    ssl?: boolean
    [key: string]: any
  }
}

// SQLite 特定配置 - 支持 Vercel Blob 存储
export interface SqliteConfig extends DatabaseConfig {
  type: 'sqlite'
  blob?: {
    enabled: boolean
    key: string // Blob 中的数据库文件键名
    syncInterval?: number // 同步间隔（秒）
    backupCount?: number // 备份数量
  }
}


// 已移除重复的错误类定义，统一使用下方的专门错误类型

// 数据库实体类型定义
export interface DatabaseUser {
  id: number | bigint  // 支持两种类型以兼容不同数据库
  email: string
  username: string
  passwordHash: string
  role: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface DatabaseApiKey {
  id: number | bigint
  userId: number | bigint
  name: string
  keyHash: string
  permissions: string[]
  isActive: boolean
  expiresAt?: Date
  lastUsedAt?: Date
  requestCount: number
  createdAt: Date
  updatedAt: Date
}

export interface DatabaseUpstreamAccount {
  id: number | bigint
  type: string
  email: string
  credentials: Record<string, any>
  isActive: boolean
  priority: number
  weight: number
  lastUsedAt?: Date
  requestCount: number
  successCount: number
  errorCount: number
  createdAt: Date
  updatedAt: Date
}

export interface DatabaseUsageRecord {
  id: number | bigint
  apiKeyId: number | bigint
  upstreamAccountId?: number | bigint
  requestId: string
  method: string
  endpoint: string
  statusCode?: number
  responseTime?: number
  tokensUsed: number
  cost: number
  errorMessage?: string
  createdAt: Date
}

// PostgreSQL 特定选项
export interface PostgreSQLOptions {
  maxConnections?: number
  connectionTimeout?: number
  queryTimeout?: number
  ssl?: boolean
}

// 专门的错误类型
export class DatabaseConnectionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message)
    this.name = 'DatabaseConnectionError'
  }
}

export class DatabaseQueryError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message)
    this.name = 'DatabaseQueryError'
  }
}

export class DatabaseTransactionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message)
    this.name = 'DatabaseTransactionError'
  }
}