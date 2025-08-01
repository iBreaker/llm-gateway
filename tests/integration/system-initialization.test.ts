import { initializeSystem, shutdownSystem, healthCheck, getSystemInfo } from '@/lib/init'
import { ServiceRegistry } from '@/lib/adapters'
import { 
  createTempDir, 
  cleanupTempDir, 
  createTestDatabaseConfig,
  createTestCacheConfig,
  createTestStorageConfig,
  sleep
} from '../helpers/test-utils'

describe('系统初始化集成测试', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
    
    // Mock 系统配置
    jest.doMock('@/lib/config', () => ({
      systemConfig: {
        database: createTestDatabaseConfig(),
        cache: createTestCacheConfig(),
        storage: createTestStorageConfig(tempDir),
        server: {
          port: 3000,
          cors: { origin: true, credentials: true }
        },
        security: {
          jwtSecret: 'test-jwt-secret-key-at-least-32-characters-long',
          encryptionKey: 'test-encryption-key-at-least-32-characters-long',
          bcryptRounds: 12
        },
        features: {
          enableWebUI: true,
          enableAPI: true,
          enableMetrics: true,
          enableRateLimit: false
        }
      },
      validateConfig: jest.fn(),
      getConfigSummary: jest.fn(() => ({ test: 'summary' }))
    }))
  })

  afterEach(async () => {
    await shutdownSystem()
    await cleanupTempDir(tempDir)
    jest.clearAllMocks()
    jest.resetModules()
    await cleanupTest()
  })

  describe('系统初始化', () => {
    test('应该能够成功初始化所有组件', async () => {
      const { database, cache, storage } = await initializeSystem()

      expect(database).toBeDefined()
      expect(cache).toBeDefined()
      expect(storage).toBeDefined()

      expect(database.isConnected()).toBe(true)
      expect(cache.isConnected()).toBe(true)
      expect(storage.isConnected()).toBe(true)
    })

    test('重复初始化应该返回相同的实例', async () => {
      const result1 = await initializeSystem()
      const result2 = await initializeSystem()

      expect(result1.database).toBe(result2.database)
      expect(result1.cache).toBe(result2.cache)
      expect(result1.storage).toBe(result2.storage)
    })

    test('初始化失败时应该清理资源', async () => {
      // Mock 数据库连接失败
      const mockConnect = jest.fn().mockRejectedValue(new Error('Connection failed'))
      
      jest.doMock('@/lib/adapters/database/sqlite', () => ({
        SqliteAdapter: jest.fn().mockImplementation(() => ({
          connect: mockConnect,
          disconnect: jest.fn(),
          isConnected: () => false
        }))
      }))

      await expect(initializeSystem()).rejects.toThrow('Connection failed')
    })

    test('应该调用配置验证', async () => {
      const { validateConfig } = require('@/lib/config')
      
      await initializeSystem()
      
      expect(validateConfig).toHaveBeenCalledTimes(1)
    })

    test('应该输出初始化日志', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      await initializeSystem()
      
      expect(consoleSpy).toHaveBeenCalledWith('🚀 开始初始化 LLM Gateway 系统...')
      expect(consoleSpy).toHaveBeenCalledWith('🎉 系统初始化完成!')
      
      consoleSpy.mockRestore()
    })
  })

  describe('系统关闭', () => {
    test('应该能够优雅关闭系统', async () => {
      const { database, cache, storage } = await initializeSystem()

      await shutdownSystem()

      expect(database.isConnected()).toBe(false)
      expect(cache.isConnected()).toBe(false)
      expect(storage.isConnected()).toBe(false)
    })

    test('未初始化时关闭应该正常工作', async () => {
      await expect(shutdownSystem()).resolves.not.toThrow()
    })

    test('应该输出关闭日志', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      
      await initializeSystem()
      await shutdownSystem()
      
      expect(consoleSpy).toHaveBeenCalledWith('🛑 开始关闭系统...')
      expect(consoleSpy).toHaveBeenCalledWith('✅ 系统关闭完成')
      
      consoleSpy.mockRestore()
    })

    test('关闭时发生错误应该抛出异常', async () => {
      await initializeSystem()
      
      // Mock 关闭失败
      const registry = ServiceRegistry.getInstance()
      jest.spyOn(registry, 'shutdown').mockRejectedValue(new Error('Shutdown failed'))

      await expect(shutdownSystem()).rejects.toThrow('Shutdown failed')
    })
  })

  describe('健康检查', () => {
    test('未初始化时应该返回不健康状态', async () => {
      const health = await healthCheck()

      expect(health.status).toBe('unhealthy')
      expect(health.services.database).toBe(false)
      expect(health.services.cache).toBe(false)
      expect(health.services.storage).toBe(false)
      expect(health.timestamp).toBeTruthy()
    })

    test('初始化后应该返回健康状态', async () => {
      await initializeSystem()
      const health = await healthCheck()

      expect(health.status).toBe('healthy')
      expect(health.services.database).toBe(true)
      expect(health.services.cache).toBe(true)
      expect(health.services.storage).toBe(true)
    })

    test('部分服务故障时应该返回不健康状态', async () => {
      await initializeSystem()
      
      // 模拟数据库连接断开
      const registry = ServiceRegistry.getInstance()
      const database = registry.getDatabase()
      await database.disconnect()

      const health = await healthCheck()

      expect(health.status).toBe('unhealthy')
      expect(health.services.database).toBe(false)
      expect(health.services.cache).toBe(true)
      expect(health.services.storage).toBe(true)
    })

    test('获取服务实例失败时应该返回不健康状态', async () => {
      await initializeSystem()
      
      // Mock 获取服务失败
      const registry = ServiceRegistry.getInstance()
      jest.spyOn(registry, 'getDatabase').mockImplementation(() => {
        throw new Error('Service not available')
      })

      const health = await healthCheck()

      expect(health.status).toBe('unhealthy')
      expect(health.services.database).toBe(false)
      expect(health.services.cache).toBe(false)
      expect(health.services.storage).toBe(false)
    })
  })

  describe('系统信息', () => {
    test('应该返回系统信息', () => {
      const info = getSystemInfo()

      expect(info).toHaveProperty('version')
      expect(info).toHaveProperty('environment')
      expect(info).toHaveProperty('uptime')
      expect(info).toHaveProperty('memory')
      expect(info).toHaveProperty('initialized')

      expect(typeof info.uptime).toBe('number')
      expect(typeof info.memory).toBe('object')
      expect(typeof info.initialized).toBe('boolean')
    })

    test('初始化前 initialized 应该为 false', () => {
      const info = getSystemInfo()
      expect(info.initialized).toBe(false)
    })

    test('初始化后 initialized 应该为 true', async () => {
      await initializeSystem()
      const info = getSystemInfo()
      expect(info.initialized).toBe(true)
    })
  })

  describe('关闭钩子', () => {
    test('应该执行自定义关闭钩子', async () => {
      const { addShutdownHook } = require('@/lib/init')
      const hookFn = jest.fn().mockResolvedValue(undefined)

      await initializeSystem()
      addShutdownHook(hookFn)
      await shutdownSystem()

      expect(hookFn).toHaveBeenCalledTimes(1)
    })

    test('关闭钩子执行失败不应该影响系统关闭', async () => {
      const { addShutdownHook } = require('@/lib/init')
      const failingHook = jest.fn().mockRejectedValue(new Error('Hook failed'))

      await initializeSystem()
      addShutdownHook(failingHook)

      await expect(shutdownSystem()).resolves.not.toThrow()
    })
  })
})

describe('适配器集成测试', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
    await cleanupTest()
  })

  describe('数据库与缓存集成', () => {
    test('数据库操作结果应该能够缓存', async () => {
      const databaseConfig = createTestDatabaseConfig()
      const cacheConfig = createTestCacheConfig()

      const { SqliteAdapter } = await import('@/lib/adapters/database/sqlite')
      const { MemoryCacheAdapter } = await import('@/lib/adapters/cache/memory')

      const database = new SqliteAdapter(databaseConfig)
      const cache = new MemoryCacheAdapter(cacheConfig)

      await database.connect()
      await cache.connect()

      try {
        // 创建测试表
        await database.raw(`
          CREATE TABLE test_users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL
          )
        `)

        // 插入测试数据
        const user = await database.create('test_users', {
          id: 'user-1',
          name: 'Test User',
          email: 'test@example.com'
        })

        // 缓存用户数据
        await cache.set(`user:${user.id}`, user, 300)

        // 从缓存读取
        const cachedUser = await cache.get(`user:${user.id}`)
        expect(cachedUser).toEqual(user)

        // 从数据库读取
        const dbUser = await database.findOne('test_users', { id: user.id })
        expect(dbUser).toEqual(user)

      } finally {
        await database.disconnect()
        await cache.disconnect()
      }
    })
  })

  describe('数据库与存储集成', () => {
    test('数据库备份应该能够存储到文件系统', async () => {
      const databaseConfig = createTestDatabaseConfig({ url: join(tempDir, 'test.db') })
      const storageConfig = createTestStorageConfig(tempDir)

      const { SqliteAdapter } = await import('@/lib/adapters/database/sqlite')
      const { LocalStorageAdapter } = await import('@/lib/adapters/storage/local')

      const database = new SqliteAdapter(databaseConfig)
      const storage = new LocalStorageAdapter(storageConfig)

      await database.connect()
      await storage.connect()

      try {
        // 创建测试表和数据
        await database.raw(`
          CREATE TABLE backup_test (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL
          )
        `)

        await database.create('backup_test', {
          id: 'test-1',
          content: 'Backup test content'
        })

        // 读取数据库文件
        const dbPath = join(tempDir, 'test.db')
        const dbContent = await require('fs/promises').readFile(dbPath)

        // 存储数据库备份
        const backupKey = `backup-${Date.now()}.db`
        await storage.put(backupKey, dbContent)

        // 验证备份
        const backup = await storage.get(backupKey)
        expect(backup).not.toBeNull()
        expect(backup!.data).toEqual(dbContent)

      } finally {
        await database.disconnect()
        await storage.disconnect()
      }
    })
  })

  describe('全栈集成测试', () => {
    test('完整的数据流应该正常工作', async () => {
      const databaseConfig = createTestDatabaseConfig()
      const cacheConfig = createTestCacheConfig()
      const storageConfig = createTestStorageConfig(tempDir)

      const { createDatabaseAdapter } = await import('@/lib/adapters')
      const { createCacheAdapter } = await import('@/lib/adapters')
      const { createStorageAdapter } = await import('@/lib/adapters')

      const database = await createDatabaseAdapter(databaseConfig)
      const cache = await createCacheAdapter(cacheConfig)
      const storage = await createStorageAdapter(storageConfig)

      await database.connect()
      await cache.connect()
      await storage.connect()

      try {
        // 1. 创建数据库表
        await database.raw(`
          CREATE TABLE integration_test (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `)

        // 2. 插入数据
        const testData = {
          id: 'integration-1',
          name: 'Integration Test',
          data: JSON.stringify({ test: true, timestamp: Date.now() })
        }

        const record = await database.create('integration_test', testData)
        expect(record.id).toBe(testData.id)

        // 3. 缓存记录
        const cacheKey = `record:${record.id}`
        await cache.set(cacheKey, record, 300)

        // 4. 存储相关文件
        const fileKey = `records/${record.id}.json`
        await storage.put(fileKey, JSON.stringify(record), {
          metadata: { contentType: 'application/json' }
        })

        // 5. 验证数据一致性
        // 从数据库读取
        const dbRecord = await database.findOne('integration_test', { id: record.id })
        expect(dbRecord).toEqual(record)

        // 从缓存读取
        const cachedRecord = await cache.get(cacheKey)
        expect(cachedRecord).toEqual(record)

        // 从存储读取
        const storedFile = await storage.get(fileKey)
        const storedRecord = JSON.parse(storedFile!.data.toString())
        expect(storedRecord).toEqual(record)

        // 6. 更新数据
        const updatedData = { name: 'Updated Integration Test' }
        const updatedRecord = await database.update('integration_test', { id: record.id }, updatedData)

        // 7. 更新缓存
        await cache.set(cacheKey, updatedRecord, 300)

        // 8. 验证更新
        expect(updatedRecord.name).toBe(updatedData.name)
        const newCachedRecord = await cache.get(cacheKey)
        expect(newCachedRecord.name).toBe(updatedData.name)

        // 9. 删除测试
        await database.delete('integration_test', { id: record.id })
        await cache.delete(cacheKey)
        await storage.delete(fileKey)

        // 10. 验证删除
        expect(await database.findOne('integration_test', { id: record.id })).toBeNull()
        expect(await cache.get(cacheKey)).toBeNull()
        expect(await storage.exists(fileKey)).toBe(false)

      } finally {
        await database.disconnect()
        await cache.disconnect()
        await storage.disconnect()
      }
    })
  })
})