import { randomBytes } from 'crypto'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtemp, rmdir } from 'fs/promises'
import { expect } from '@jest/globals'
import type { DatabaseConfig, SqliteConfig } from '@/lib/interfaces/database'
import type { CacheConfig } from '@/lib/interfaces/cache'

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

// 等待指定时间
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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