import { randomBytes } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtemp, rmdir } from 'fs/promises'
import type { DatabaseConfig, SqliteConfig } from '@/lib/interfaces/database'
import type { CacheConfig } from '@/lib/interfaces/cache'
import type { StorageConfig } from '@/lib/interfaces/storage'

// 生成测试用的随机 ID
export function generateTestId(prefix = 'test'): string {
  return `${prefix}-${randomBytes(8).toString('hex')}`
}

// 创建临时目录
export async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'llmgw-test-'))
}

// 清理临时目录
export async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await rmdir(dir, { recursive: true })
  } catch (error) {
    // 忽略清理错误
  }
}

// 测试用数据库配置
export function createTestDatabaseConfig(overrides: Partial<DatabaseConfig> = {}): DatabaseConfig {
  return {
    type: 'sqlite',
    url: ':memory:', // 使用内存数据库
    options: {
      maxConnections: 1,
      connectionTimeout: 5000,
      queryTimeout: 10000,
    },
    ...overrides,
  }
}

// 测试用 SQLite + Blob 配置
export function createTestSqliteBlobConfig(tempDir: string): SqliteConfig {
  return {
    type: 'sqlite',
    url: join(tempDir, 'test.db'),
    options: {
      maxConnections: 1,
      connectionTimeout: 5000,
      queryTimeout: 10000,
    },
    blob: {
      enabled: true,
      key: 'test-database.db',
      syncInterval: 10, // 快速测试
      backupCount: 2,
    },
  }
}

// 测试用缓存配置
export function createTestCacheConfig(overrides: Partial<CacheConfig> = {}): CacheConfig {
  return {
    type: 'memory',
    options: {
      maxMemory: 10 * 1024 * 1024, // 10MB
      defaultTtl: 60,
    },
    ...overrides,
  }
}

// 测试用存储配置
export function createTestStorageConfig(tempDir: string): StorageConfig {
  return {
    type: 'local',
    options: {
      rootPath: tempDir,
      createDirectories: true,
    },
  }
}

// 等待指定时间
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Mock 存储适配器
export class MockStorageAdapter {
  private files = new Map<string, Buffer>()

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  isConnected(): boolean { return true }

  async put(key: string, data: Buffer | string | Uint8Array): Promise<any> {
    const buffer = Buffer.isBuffer(data) ? data : 
                   data instanceof Uint8Array ? Buffer.from(data) :
                   Buffer.from(data, 'utf8')
    this.files.set(key, buffer)
    return {
      key,
      size: buffer.length,
      etag: 'mock-etag',
    }
  }

  async get(key: string): Promise<any> {
    const data = this.files.get(key)
    if (!data) return null
    
    return {
      key,
      data,
      metadata: {},
      stat: {
        key,
        size: data.length,
        lastModified: new Date(),
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.files.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.files.has(key)
  }

  async list(prefix?: string): Promise<any[]> {
    const results: any[] = []
    for (const [key, data] of this.files.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        results.push({
          key,
          data,
          metadata: {},
          stat: {
            key,
            size: data.length,
            lastModified: new Date(),
          }
        })
      }
    }
    return results
  }

  // 其他必需的方法
  async putMany(): Promise<any[]> { return [] }
  async getMany(): Promise<any[]> { return [] }
  async deleteMany(): Promise<boolean[]> { return [] }
  async stat(): Promise<any> { return null }
  async createReadStream(): Promise<any> { throw new Error('Not implemented') }
  async createWriteStream(): Promise<any> { throw new Error('Not implemented') }
  async getSignedUrl(): Promise<string> { throw new Error('Not implemented') }
  getPublicUrl(): string { throw new Error('Not implemented') }
  async createFolder(): Promise<void> {}
  async deleteFolder(): Promise<void> {}
  async copy(): Promise<any> { throw new Error('Not implemented') }
  async move(): Promise<any> { throw new Error('Not implemented') }

  // 测试辅助方法
  clear(): void {
    this.files.clear()
  }

  getFileCount(): number {
    return this.files.size
  }

  hasFile(key: string): boolean {
    return this.files.has(key)
  }
}

// 断言辅助函数
export function expectDefined<T>(value: T | null | undefined): asserts value is T {
  expect(value).toBeDefined()
  expect(value).not.toBeNull()
}

// 测试数据生成器
export const TestData = {
  user: (overrides = {}) => ({
    id: generateTestId('user'),
    email: 'test@example.com',
    name: 'Test User',
    hashedPassword: 'hashed-password',
    role: 'user' as const,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  apiKey: (overrides = {}) => ({
    id: generateTestId('key'),
    userId: generateTestId('user'),
    name: 'Test API Key',
    keyHash: 'hashed-key',
    permissions: JSON.stringify(['read', 'write']),
    expiresAt: null,
    lastUsedAt: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  upstreamAccount: (overrides = {}) => ({
    id: generateTestId('account'),
    userId: generateTestId('user'),
    service: 'claude' as const,
    name: 'Test Claude Account',
    description: 'Test account description',
    encryptedCredentials: JSON.stringify({ token: 'encrypted-token' }),
    status: 'active' as const,
    accountType: 'shared' as const,
    priority: 1,
    proxyConfig: null,
    totalRequests: 0,
    successfulRequests: 0,
    lastUsedAt: null,
    lastErrorAt: null,
    lastErrorMessage: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  usageStat: (overrides = {}) => ({
    id: generateTestId('stat'),
    userId: generateTestId('user'),
    apiKeyId: generateTestId('key'),
    upstreamAccountId: generateTestId('account'),
    service: 'claude' as const,
    model: 'claude-3-sonnet',
    endpoint: '/v1/messages',
    method: 'POST',
    statusCode: 200,
    responseTime: 1500,
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    inputCost: 0.001,
    outputCost: 0.002,
    totalCost: 0.003,
    requestAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  }),
}