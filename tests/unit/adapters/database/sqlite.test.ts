import { SqliteAdapter } from '@/lib/adapters/database/sqlite'
import { 
  createTestDatabaseConfig, 
  createTestSqliteBlobConfig,
  createTempDir, 
  cleanupTempDir,
  MockStorageAdapter,
  TestData,
  sleep,
  expectDefined
} from '../../../helpers/test-utils'
import type { SqliteConfig } from '@/lib/interfaces/database'

describe('SqliteAdapter', () => {
  let adapter: SqliteAdapter
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect()
    }
    await cleanupTempDir(tempDir)
    await cleanupTest()
  })

  describe('基础连接管理', () => {
    test('应该能够连接内存数据库', async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)
    })

    test('应该能够断开数据库连接', async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)

      await adapter.disconnect()
      expect(adapter.isConnected()).toBe(false)
    })

    test('连接失败时应该抛出错误', async () => {
      const config = createTestDatabaseConfig({
        url: '/invalid/path/database.db'
      })
      adapter = new SqliteAdapter(config)

      await expect(adapter.connect()).rejects.toThrow('连接 SQLite 数据库失败')
    })
  })

  describe('CRUD 操作', () => {
    beforeEach(async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()

      // 创建测试表
      await adapter.raw(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          hashedPassword TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          isActive INTEGER DEFAULT 1,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)
    })

    test('create - 应该能够创建记录', async () => {
      const userData = TestData.user()
      
      const result = await adapter.create('users', userData)
      
      expect(result).toMatchObject(userData)
      expect(result.id).toBe(userData.id)
    })

    test('findOne - 应该能够查找单条记录', async () => {
      const userData = TestData.user()
      await adapter.create('users', userData)

      const result = await adapter.findOne('users', { id: userData.id })
      
      expectDefined(result)
      expect(result.id).toBe(userData.id)
      expect(result.email).toBe(userData.email)
    })

    test('findOne - 找不到记录时应该返回 null', async () => {
      const result = await adapter.findOne('users', { id: 'non-existent' })
      expect(result).toBeNull()
    })

    test('findMany - 应该能够查找多条记录', async () => {
      const user1 = TestData.user({ name: 'User 1' })
      const user2 = TestData.user({ name: 'User 2' })
      
      await adapter.create('users', user1)
      await adapter.create('users', user2)

      const results = await adapter.findMany('users')
      
      expect(results).toHaveLength(2)
      expect(results.map(u => u.name)).toContain('User 1')
      expect(results.map(u => u.name)).toContain('User 2')
    })

    test('findMany - 应该支持 where 条件', async () => {
      const user1 = TestData.user({ role: 'admin' })
      const user2 = TestData.user({ role: 'user' })
      
      await adapter.create('users', user1)
      await adapter.create('users', user2)

      const results = await adapter.findMany('users', { role: 'admin' })
      
      expect(results).toHaveLength(1)
      expect(results[0].role).toBe('admin')
    })

    test('findMany - 应该支持查询选项', async () => {
      const users = Array.from({ length: 5 }, (_, i) => 
        TestData.user({ name: `User ${i}` })
      )
      
      for (const user of users) {
        await adapter.create('users', user)
      }

      const results = await adapter.findMany('users', {}, {
        limit: 2,
        offset: 1,
        orderBy: [{ field: 'name', direction: 'asc' }]
      })
      
      expect(results).toHaveLength(2)
      expect(results[0].name).toBe('User 1')
      expect(results[1].name).toBe('User 2')
    })

    test('update - 应该能够更新记录', async () => {
      const userData = TestData.user()
      await adapter.create('users', userData)

      const updatedData = { name: 'Updated Name' }
      const result = await adapter.update('users', { id: userData.id }, updatedData)
      
      expect(result.name).toBe('Updated Name')
      expect(result.id).toBe(userData.id)
    })

    test('delete - 应该能够删除记录', async () => {
      const userData = TestData.user()
      await adapter.create('users', userData)

      const deletedCount = await adapter.delete('users', { id: userData.id })
      
      expect(deletedCount).toBe(1)
      
      const result = await adapter.findOne('users', { id: userData.id })
      expect(result).toBeNull()
    })

    test('count - 应该能够统计记录数', async () => {
      const user1 = TestData.user()
      const user2 = TestData.user()
      
      await adapter.create('users', user1)
      await adapter.create('users', user2)

      const count = await adapter.count('users')
      expect(count).toBe(2)

      const adminCount = await adapter.count('users', { role: 'admin' })
      expect(adminCount).toBe(0)
    })

    test('exists - 应该能够检查记录是否存在', async () => {
      const userData = TestData.user()
      await adapter.create('users', userData)

      const exists = await adapter.exists('users', { id: userData.id })
      expect(exists).toBe(true)

      const notExists = await adapter.exists('users', { id: 'non-existent' })
      expect(notExists).toBe(false)
    })
  })

  describe('批量操作', () => {
    beforeEach(async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()

      await adapter.raw(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          hashedPassword TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          isActive INTEGER DEFAULT 1,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)
    })

    test('createMany - 应该能够批量创建记录', async () => {
      const users = [
        TestData.user({ name: 'User 1' }),
        TestData.user({ name: 'User 2' }),
        TestData.user({ name: 'User 3' })
      ]

      const results = await adapter.createMany('users', users)
      
      expect(results).toHaveLength(3)
      expect(results.map(u => u.name)).toEqual(['User 1', 'User 2', 'User 3'])
    })

    test('updateMany - 应该能够批量更新记录', async () => {
      const users = [
        TestData.user({ role: 'user' }),
        TestData.user({ role: 'user' })
      ]
      
      for (const user of users) {
        await adapter.create('users', user)
      }

      const updatedCount = await adapter.updateMany('users', { role: 'user' }, { role: 'admin' })
      
      expect(updatedCount).toBe(2)
      
      const adminCount = await adapter.count('users', { role: 'admin' })
      expect(adminCount).toBe(2)
    })

    test('deleteMany - 应该能够批量删除记录', async () => {
      const users = [
        TestData.user({ role: 'temp' }),
        TestData.user({ role: 'temp' }),
        TestData.user({ role: 'user' })
      ]
      
      for (const user of users) {
        await adapter.create('users', user)
      }

      const deletedCount = await adapter.deleteMany('users', { role: 'temp' })
      
      expect(deletedCount).toBe(2)
      
      const remainingCount = await adapter.count('users')
      expect(remainingCount).toBe(1)
    })
  })

  describe('事务处理', () => {
    beforeEach(async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()

      await adapter.raw(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          hashedPassword TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          isActive INTEGER DEFAULT 1,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `)
    })

    test('transaction - 应该能够执行事务', async () => {
      const user1 = TestData.user({ name: 'User 1' })
      const user2 = TestData.user({ name: 'User 2' })

      const results = await adapter.transaction(async (tx) => {
        const result1 = await tx.create('users', user1)
        const result2 = await tx.create('users', user2)
        return [result1, result2]
      })

      expect(results).toHaveLength(2)
      
      const count = await adapter.count('users')
      expect(count).toBe(2)
    })

    test('transaction - 出错时应该回滚', async () => {
      const user1 = TestData.user({ name: 'User 1' })
      const user2 = TestData.user({ email: user1.email }) // 重复邮箱

      await expect(adapter.transaction(async (tx) => {
        await tx.create('users', user1)
        await tx.create('users', user2) // 这里会失败，因为邮箱重复
      })).rejects.toThrow()

      const count = await adapter.count('users')
      expect(count).toBe(0) // 事务回滚，没有创建任何记录
    })
  })

  describe('Blob 存储集成', () => {
    let mockStorage: MockStorageAdapter

    beforeEach(() => {
      mockStorage = new MockStorageAdapter()
    })

    test('应该能够从 Blob 下载数据库文件', async () => {
      const config = createTestSqliteBlobConfig(tempDir)
      
      // 模拟 Blob 中已有数据库文件
      const dbData = Buffer.from('mock-db-data')
      await mockStorage.put(config.blob!.key, dbData)

      adapter = new SqliteAdapter(config, mockStorage)
      await adapter.connect()

      expect(adapter.isConnected()).toBe(true)
      expect(mockStorage.hasFile(config.blob!.key)).toBe(true)
    })

    test('应该能够定期同步数据库到 Blob', async () => {
      const config = createTestSqliteBlobConfig(tempDir)
      config.blob!.syncInterval = 1 // 1 秒同步间隔

      adapter = new SqliteAdapter(config, mockStorage)
      await adapter.connect()

      // 创建测试表和数据
      await adapter.raw(`
        CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)
      `)
      await adapter.create('test', { id: 'test-1', name: 'Test' })

      // 等待同步
      await sleep(1500)

      expect(mockStorage.hasFile(config.blob!.key)).toBe(true)
    })

    test('断开连接时应该同步数据库到 Blob', async () => {
      const config = createTestSqliteBlobConfig(tempDir)
      
      adapter = new SqliteAdapter(config, mockStorage)
      await adapter.connect()

      // 创建测试数据
      await adapter.raw(`
        CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)
      `)
      await adapter.create('test', { id: 'test-1', name: 'Test' })

      await adapter.disconnect()

      expect(mockStorage.hasFile(config.blob!.key)).toBe(true)
    })

    test('应该创建备份文件', async () => {
      const config = createTestSqliteBlobConfig(tempDir)
      config.blob!.backupCount = 2

      adapter = new SqliteAdapter(config, mockStorage)
      await adapter.connect()

      // 创建测试数据
      await adapter.raw(`
        CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)
      `)
      await adapter.create('test', { id: 'test-1', name: 'Test' })

      // 手动同步
      await (adapter as any).syncToBlob()

      // 检查是否创建了备份
      const files = await mockStorage.list(config.blob!.key)
      const backupFiles = files.filter(f => f.key.includes('.backup.'))
      expect(backupFiles.length).toBeGreaterThan(0)
    })

    test('应该清理旧备份', async () => {
      const config = createTestSqliteBlobConfig(tempDir)
      config.blob!.backupCount = 1

      adapter = new SqliteAdapter(config, mockStorage)
      await adapter.connect()

      // 创建测试数据
      await adapter.raw(`
        CREATE TABLE test (id TEXT PRIMARY KEY, name TEXT)
      `)

      // 创建多个备份
      for (let i = 0; i < 3; i++) {
        await adapter.create('test', { id: `test-${i}`, name: `Test ${i}` })
        await (adapter as any).syncToBlob()
        await sleep(100) // 确保时间戳不同
      }

      // 检查备份数量
      const files = await mockStorage.list(config.blob!.key)
      const backupFiles = files.filter(f => f.key.includes('.backup.'))
      expect(backupFiles).toHaveLength(1) // 只保留 1 个备份
    })
  })

  describe('原生 SQL 查询', () => {
    beforeEach(async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()

      await adapter.raw(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL
        )
      `)
    })

    test('raw - 应该能够执行 SELECT 查询', async () => {
      await adapter.raw(`INSERT INTO users (id, name, email) VALUES ('1', 'Test', 'test@example.com')`)
      
      const results = await adapter.raw<{ id: string; name: string; email: string }>(`
        SELECT * FROM users WHERE id = ?
      `, ['1'])

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Test')
    })

    test('raw - 应该能够执行 INSERT/UPDATE/DELETE 查询', async () => {
      await adapter.raw(`
        INSERT INTO users (id, name, email) VALUES ('1', 'Test', 'test@example.com')
      `)

      const results = await adapter.raw(`SELECT COUNT(*) as count FROM users`)
      expect((results[0] as any).count).toBe(1)
    })
  })

  describe('错误处理', () => {
    test('重复主键应该抛出错误', async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()

      await adapter.raw(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        )
      `)

      const user = { id: 'test-1', name: 'Test' }
      await adapter.create('users', user)

      await expect(adapter.create('users', user)).rejects.toThrow()
    })

    test('查询不存在的表应该抛出错误', async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()

      await expect(adapter.findOne('nonexistent', { id: '1' })).rejects.toThrow()
    })

    test('断开连接后操作应该抛出错误', async () => {
      const config = createTestDatabaseConfig()
      adapter = new SqliteAdapter(config)
      await adapter.connect()
      await adapter.disconnect()

      await expect(adapter.findOne('users', { id: '1' })).rejects.toThrow('数据库未连接')
    })
  })
})