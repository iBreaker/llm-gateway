import { MemoryCacheAdapter } from '@/lib/adapters/cache/memory'
import { createTestCacheConfig, sleep, generateTestId } from '../../../helpers/test-utils'
import type { CacheConfig } from '@/lib/interfaces/cache'

describe('MemoryCacheAdapter', () => {
  let adapter: MemoryCacheAdapter

  afterEach(async () => {
    if (adapter) {
      await adapter.disconnect()
    }
    await cleanupTest()
  })

  describe('连接管理', () => {
    test('应该能够连接缓存', async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)
    })

    test('应该能够断开缓存连接', async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)

      await adapter.disconnect()
      expect(adapter.isConnected()).toBe(false)
    })

    test('重复连接应该正常工作', async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)

      await adapter.connect()
      await adapter.connect() // 第二次连接
      expect(adapter.isConnected()).toBe(true)
    })
  })

  describe('基础缓存操作', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()
    })

    test('set/get - 应该能够设置和获取缓存', async () => {
      const key = 'test-key'
      const value = { message: 'Hello, World!' }

      await adapter.set(key, value)
      const result = await adapter.get(key)

      expect(result).toEqual(value)
    })

    test('get - 不存在的键应该返回 null', async () => {
      const result = await adapter.get('non-existent-key')
      expect(result).toBeNull()
    })

    test('set - 应该支持 TTL 过期', async () => {
      const key = 'ttl-key'
      const value = 'ttl-value'

      await adapter.set(key, value, 1) // 1 秒过期
      
      // 立即获取应该有值
      let result = await adapter.get(key)
      expect(result).toBe(value)

      // 等待过期
      await sleep(1100)
      result = await adapter.get(key)
      expect(result).toBeNull()
    })

    test('delete - 应该能够删除缓存', async () => {
      const key = 'delete-key'
      const value = 'delete-value'

      await adapter.set(key, value)
      expect(await adapter.get(key)).toBe(value)

      const deleted = await adapter.delete(key)
      expect(deleted).toBe(true)
      expect(await adapter.get(key)).toBeNull()
    })

    test('delete - 删除不存在的键应该返回 false', async () => {
      const deleted = await adapter.delete('non-existent-key')
      expect(deleted).toBe(false)
    })

    test('exists - 应该能够检查键是否存在', async () => {
      const key = 'exists-key'
      const value = 'exists-value'

      expect(await adapter.exists(key)).toBe(false)

      await adapter.set(key, value)
      expect(await adapter.exists(key)).toBe(true)

      await adapter.delete(key)
      expect(await adapter.exists(key)).toBe(false)
    })

    test('exists - 过期的键应该返回 false', async () => {
      const key = 'expires-key'
      const value = 'expires-value'

      await adapter.set(key, value, 1) // 1 秒过期
      expect(await adapter.exists(key)).toBe(true)

      await sleep(1100)
      expect(await adapter.exists(key)).toBe(false)
    })
  })

  describe('批量操作', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()
    })

    test('mset/mget - 应该能够批量设置和获取', async () => {
      const items = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' }
      ]

      await adapter.mset(items)
      const results = await adapter.mget(['key1', 'key2', 'key3', 'non-existent'])

      expect(results).toEqual(['value1', 'value2', 'value3', null])
    })

    test('mget - 空数组应该返回空数组', async () => {
      const results = await adapter.mget([])
      expect(results).toEqual([])
    })

    test('mdel - 应该能够批量删除', async () => {
      await adapter.set('key1', 'value1')
      await adapter.set('key2', 'value2')
      await adapter.set('key3', 'value3')

      const deletedCount = await adapter.mdel(['key1', 'key3', 'non-existent'])
      
      expect(deletedCount).toBe(2)
      expect(await adapter.get('key1')).toBeNull()
      expect(await adapter.get('key2')).toBe('value2')
      expect(await adapter.get('key3')).toBeNull()
    })
  })

  describe('数值操作', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()
    })

    test('increment - 应该能够递增数值', async () => {
      const key = 'counter'

      const result1 = await adapter.increment(key)
      expect(result1).toBe(1)

      const result2 = await adapter.increment(key, 5)
      expect(result2).toBe(6)

      const result3 = await adapter.increment(key)
      expect(result3).toBe(7)
    })

    test('decrement - 应该能够递减数值', async () => {
      const key = 'counter'
      await adapter.set(key, 10)

      const result1 = await adapter.decrement(key)
      expect(result1).toBe(9)

      const result2 = await adapter.decrement(key, 3)
      expect(result2).toBe(6)

      const result3 = await adapter.decrement(key)
      expect(result3).toBe(5)
    })

    test('increment/decrement - 非数值键应该从 0 开始', async () => {
      const key = 'new-counter'

      const result1 = await adapter.increment(key, 5)
      expect(result1).toBe(5)

      const result2 = await adapter.decrement(key, 2)
      expect(result2).toBe(3)
    })
  })

  describe('TTL 操作', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()
    })

    test('expire - 应该能够设置过期时间', async () => {
      const key = 'expire-key'
      const value = 'expire-value'

      await adapter.set(key, value)
      const result = await adapter.expire(key, 1) // 1 秒过期
      
      expect(result).toBe(true)
      expect(await adapter.get(key)).toBe(value)

      await sleep(1100)
      expect(await adapter.get(key)).toBeNull()
    })

    test('expire - 不存在的键应该返回 false', async () => {
      const result = await adapter.expire('non-existent', 60)
      expect(result).toBe(false)
    })

    test('ttl - 应该能够获取剩余过期时间', async () => {
      const key = 'ttl-key'
      const value = 'ttl-value'

      // 不存在的键
      expect(await adapter.ttl('non-existent')).toBe(-2)

      // 无过期时间的键
      await adapter.set(key, value)
      expect(await adapter.ttl(key)).toBe(-1)

      // 有过期时间的键
      await adapter.set(key, value, 10)
      const ttl = await adapter.ttl(key)
      expect(ttl).toBeGreaterThan(8)
      expect(ttl).toBeLessThanOrEqual(10)

      // 过期的键
      await adapter.set(key, value, 1)
      await sleep(1100)
      expect(await adapter.ttl(key)).toBe(-2)
    })
  })

  describe('模式匹配', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()

      // 设置测试数据
      await adapter.set('user:1', 'John')
      await adapter.set('user:2', 'Jane')
      await adapter.set('user:3', 'Bob')
      await adapter.set('product:1', 'Laptop')
      await adapter.set('product:2', 'Phone')
      await adapter.set('config:timeout', '30')
    })

    test('keys - 应该能够按模式查找键', async () => {
      const userKeys = await adapter.keys('user:*')
      expect(userKeys.sort()).toEqual(['user:1', 'user:2', 'user:3'])

      const productKeys = await adapter.keys('product:*')
      expect(productKeys.sort()).toEqual(['product:1', 'product:2'])

      const allKeys = await adapter.keys('*')
      expect(allKeys).toHaveLength(6)
    })

    test('keys - 精确匹配应该工作', async () => {
      const keys = await adapter.keys('user:1')
      expect(keys).toEqual(['user:1'])
    })

    test('scan - 应该能够分页扫描键', async () => {
      const result1 = await adapter.scan(0, 'user:*', 2)
      expect(result1.keys).toHaveLength(2)
      expect(result1.cursor).toBeGreaterThan(0)

      const result2 = await adapter.scan(result1.cursor, 'user:*', 2)
      expect(result2.keys).toHaveLength(1)
      expect(result2.cursor).toBe(0) // 扫描完成
    })

    test('scan - 无匹配结果应该返回空数组', async () => {
      const result = await adapter.scan(0, 'nonexistent:*', 10)
      expect(result.keys).toEqual([])
      expect(result.cursor).toBe(0)
    })
  })

  describe('清理操作', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()

      // 设置测试数据
      await adapter.set('key1', 'value1')
      await adapter.set('key2', 'value2')
      await adapter.set('key3', 'value3')
    })

    test('clear - 应该能够清空所有缓存', async () => {
      expect(await adapter.get('key1')).toBe('value1')

      await adapter.clear()

      expect(await adapter.get('key1')).toBeNull()
      expect(await adapter.get('key2')).toBeNull()
      expect(await adapter.get('key3')).toBeNull()
    })

    test('flushAll - 应该能够清空所有缓存', async () => {
      expect(await adapter.get('key1')).toBe('value1')

      await adapter.flushAll()

      expect(await adapter.get('key1')).toBeNull()
      expect(await adapter.get('key2')).toBeNull()
      expect(await adapter.get('key3')).toBeNull()
    })
  })

  describe('分布式锁', () => {
    beforeEach(async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()
    })

    test('lock - 应该能够获取锁', async () => {
      const key = 'test-lock'
      const ttl = 10

      const lock = await adapter.lock(key, ttl)
      
      expect(lock).not.toBeNull()
      expect(lock!.key).toBe(`lock:${key}`)
      expect(lock!.ttl).toBe(ttl)
    })

    test('lock - 重复获取同一个锁应该失败', async () => {
      const key = 'test-lock'

      const lock1 = await adapter.lock(key, 10)
      expect(lock1).not.toBeNull()

      const lock2 = await adapter.lock(key, 10)
      expect(lock2).toBeNull()
    })

    test('lock - 过期的锁应该能够重新获取', async () => {
      const key = 'test-lock'

      const lock1 = await adapter.lock(key, 1) // 1 秒过期
      expect(lock1).not.toBeNull()

      await sleep(1100)

      const lock2 = await adapter.lock(key, 10)
      expect(lock2).not.toBeNull()
    })

    test('lock.release - 应该能够释放锁', async () => {
      const key = 'test-lock'

      const lock = await adapter.lock(key, 10)
      expect(lock).not.toBeNull()

      const released = await lock!.release()
      expect(released).toBe(true)

      // 释放后应该能够重新获取
      const newLock = await adapter.lock(key, 10)
      expect(newLock).not.toBeNull()
    })

    test('lock.extend - 应该能够延长锁的过期时间', async () => {
      const key = 'test-lock'

      const lock = await adapter.lock(key, 2)
      expect(lock).not.toBeNull()

      const extended = await lock!.extend(10)
      expect(extended).toBe(true)
      expect(lock!.ttl).toBe(10)
    })

    test('lock - 重试机制应该工作', async () => {
      const key = 'retry-lock'

      // 获取第一个锁
      const lock1 = await adapter.lock(key, 1) // 1 秒过期
      expect(lock1).not.toBeNull()

      // 尝试获取同一个锁，会重试
      setTimeout(async () => {
        await lock1!.release()
      }, 300) // 300ms 后释放锁

      const lock2 = await adapter.lock(key, 10, 5) // 重试 5 次
      expect(lock2).not.toBeNull()
    })
  })

  describe('LRU 淘汰机制', () => {
    test('应该在达到最大大小时淘汰最少使用的项', async () => {
      const config: CacheConfig = {
        type: 'memory',
        options: {
          maxSize: 3, // 最多 3 个项
          updateAgeOnGet: true
        }
      }

      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()

      // 添加 3 个项
      await adapter.set('key1', 'value1')
      await adapter.set('key2', 'value2')
      await adapter.set('key3', 'value3')

      // 访问 key1，使其成为最近使用的
      await adapter.get('key1')

      // 添加第 4 个项，应该淘汰 key2（最少使用）
      await adapter.set('key4', 'value4')

      expect(await adapter.get('key1')).toBe('value1') // 保留
      expect(await adapter.get('key2')).toBeNull()     // 被淘汰
      expect(await adapter.get('key3')).toBe('value3') // 保留
      expect(await adapter.get('key4')).toBe('value4') // 新增
    })
  })

  describe('自动清理', () => {
    test('应该定期清理过期项', async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()

      // 设置一个短期过期的项
      await adapter.set('expire-key', 'expire-value', 1)
      expect(await adapter.get('expire-key')).toBe('expire-value')

      // 等待过期 + 清理间隔
      await sleep(62000) // 1秒过期 + 60秒清理间隔 + 缓冲

      // 此时应该已经被清理了
      expect(await adapter.get('expire-key')).toBeNull()
    }, 65000) // 设置更长的测试超时
  })

  describe('错误处理', () => {
    test('未连接时操作应该抛出错误', async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      // 不调用 connect()

      await expect(adapter.get('key')).rejects.toThrow('缓存未连接')
      await expect(adapter.set('key', 'value')).rejects.toThrow('缓存未连接')
      await expect(adapter.delete('key')).rejects.toThrow('缓存未连接')
    })

    test('断开连接后操作应该抛出错误', async () => {
      const config = createTestCacheConfig()
      adapter = new MemoryCacheAdapter(config)
      await adapter.connect()
      await adapter.disconnect()

      await expect(adapter.get('key')).rejects.toThrow('缓存未连接')
    })
  })
})