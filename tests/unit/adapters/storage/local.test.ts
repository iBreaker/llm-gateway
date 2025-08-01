import { LocalStorageAdapter } from '@/lib/adapters/storage/local'
import { 
  createTestStorageConfig,
  createTempDir, 
  cleanupTempDir,
  generateTestId
} from '../../../helpers/test-utils'
import { join } from 'path'
import { writeFile, readFile, mkdir, stat } from 'fs/promises'

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter
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

  describe('连接管理', () => {
    test('应该能够连接存储', async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)
    })

    test('应该能够断开存储连接', async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)

      await adapter.disconnect()
      expect(adapter.isConnected()).toBe(false)
    })

    test('应该能够创建不存在的根目录', async () => {
      const nonExistentDir = join(tempDir, 'nested', 'directory')
      const config = createTestStorageConfig(nonExistentDir)
      adapter = new LocalStorageAdapter(config)

      await adapter.connect()
      expect(adapter.isConnected()).toBe(true)

      // 检查目录是否被创建
      const stats = await stat(nonExistentDir)
      expect(stats.isDirectory()).toBe(true)
    })

    test('连接到无权限的目录应该抛出错误', async () => {
      const config = createTestStorageConfig('/root/no-permission')
      adapter = new LocalStorageAdapter(config)

      await expect(adapter.connect()).rejects.toThrow('本地存储连接失败')
    })
  })

  describe('基础文件操作', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('put/get - 应该能够存储和获取文件', async () => {
      const key = 'test-file.txt'
      const content = 'Hello, World!'

      const result = await adapter.put(key, content)
      expect(result.key).toBe(key)
      expect(result.size).toBe(content.length)

      const file = await adapter.get(key)
      expect(file).not.toBeNull()
      expect(file!.key).toBe(key)
      expect(file!.data.toString()).toBe(content)
    })

    test('put - 应该支持 Buffer 数据', async () => {
      const key = 'buffer-file.bin'
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"

      await adapter.put(key, buffer)
      const file = await adapter.get(key)

      expect(file!.data).toEqual(buffer)
    })

    test('put - 应该支持 Uint8Array 数据', async () => {
      const key = 'uint8-file.bin'
      const data = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"

      await adapter.put(key, data)
      const file = await adapter.get(key)

      expect(file!.data).toEqual(Buffer.from(data))
    })

    test('put - 应该支持元数据', async () => {
      const key = 'metadata-file.txt'
      const content = 'Content with metadata'
      const metadata = {
        contentType: 'text/plain',
        customField: 'custom-value'
      }

      await adapter.put(key, content, { metadata })
      const file = await adapter.get(key)

      expect(file!.metadata.contentType).toBe('text/plain')
      expect(file!.metadata.customField).toBe('custom-value')
    })

    test('put - 应该支持嵌套路径', async () => {
      const key = 'nested/path/file.txt'
      const content = 'Nested file content'

      await adapter.put(key, content)
      const file = await adapter.get(key)

      expect(file!.data.toString()).toBe(content)
    })

    test('put - overwrite=false 时不应该覆盖已存在的文件', async () => {
      const key = 'no-overwrite.txt'
      const content1 = 'Original content'
      const content2 = 'New content'

      await adapter.put(key, content1)
      
      await expect(
        adapter.put(key, content2, { overwrite: false })
      ).rejects.toThrow('文件已存在')

      const file = await adapter.get(key)
      expect(file!.data.toString()).toBe(content1)
    })

    test('get - 不存在的文件应该返回 null', async () => {
      const file = await adapter.get('non-existent.txt')
      expect(file).toBeNull()
    })

    test('delete - 应该能够删除文件', async () => {
      const key = 'delete-me.txt'
      const content = 'This will be deleted'

      await adapter.put(key, content)
      expect(await adapter.get(key)).not.toBeNull()

      const deleted = await adapter.delete(key)
      expect(deleted).toBe(true)
      expect(await adapter.get(key)).toBeNull()
    })

    test('delete - 删除不存在的文件应该返回 false', async () => {
      const deleted = await adapter.delete('non-existent.txt')
      expect(deleted).toBe(false)
    })

    test('exists - 应该能够检查文件是否存在', async () => {
      const key = 'exists-test.txt'
      const content = 'Existence test'

      expect(await adapter.exists(key)).toBe(false)

      await adapter.put(key, content)
      expect(await adapter.exists(key)).toBe(true)

      await adapter.delete(key)
      expect(await adapter.exists(key)).toBe(false)
    })
  })

  describe('批量操作', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('putMany - 应该能够批量存储文件', async () => {
      const items = [
        { key: 'file1.txt', data: 'Content 1' },
        { key: 'file2.txt', data: 'Content 2' },
        { key: 'file3.txt', data: 'Content 3' }
      ]

      const results = await adapter.putMany(items)
      
      expect(results).toHaveLength(3)
      expect(results[0].key).toBe('file1.txt')
      expect(results[1].key).toBe('file2.txt')
      expect(results[2].key).toBe('file3.txt')

      // 验证文件确实被创建
      for (const item of items) {
        const file = await adapter.get(item.key)
        expect(file!.data.toString()).toBe(item.data)
      }
    })

    test('getMany - 应该能够批量获取文件', async () => {
      const items = [
        { key: 'batch1.txt', data: 'Batch content 1' },
        { key: 'batch2.txt', data: 'Batch content 2' }
      ]

      for (const item of items) {
        await adapter.put(item.key, item.data)
      }

      const results = await adapter.getMany(['batch1.txt', 'batch2.txt', 'non-existent.txt'])
      
      expect(results).toHaveLength(3)
      expect(results[0]!.data.toString()).toBe('Batch content 1')
      expect(results[1]!.data.toString()).toBe('Batch content 2')
      expect(results[2]).toBeNull()
    })

    test('deleteMany - 应该能够批量删除文件', async () => {
      const keys = ['delete1.txt', 'delete2.txt', 'non-existent.txt']
      
      await adapter.put(keys[0], 'Delete me 1')
      await adapter.put(keys[1], 'Delete me 2')

      const results = await adapter.deleteMany(keys)
      
      expect(results).toEqual([true, true, false])
      expect(await adapter.exists(keys[0])).toBe(false)
      expect(await adapter.exists(keys[1])).toBe(false)
    })
  })

  describe('文件信息', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('stat - 应该能够获取文件统计信息', async () => {
      const key = 'stat-test.txt'
      const content = 'Statistical content'
      const metadata = { contentType: 'text/plain' }

      await adapter.put(key, content, { metadata })
      const stats = await adapter.stat(key)

      expect(stats).not.toBeNull()
      expect(stats!.key).toBe(key)
      expect(stats!.size).toBe(content.length)
      expect(stats!.contentType).toBe('text/plain')
      expect(stats!.lastModified).toBeInstanceOf(Date)
      expect(stats!.etag).toBeTruthy()
    })

    test('stat - 不存在的文件应该返回 null', async () => {
      const stats = await adapter.stat('non-existent.txt')
      expect(stats).toBeNull()
    })

    test('list - 应该能够列出文件', async () => {
      const files = [
        { key: 'list/file1.txt', content: 'File 1' },
        { key: 'list/file2.txt', content: 'File 2' },
        { key: 'other/file3.txt', content: 'File 3' }
      ]

      for (const file of files) {
        await adapter.put(file.key, file.content)
      }

      const allFiles = await adapter.list()
      expect(allFiles.length).toBeGreaterThanOrEqual(3)

      const listFiles = await adapter.list('list/')
      expect(listFiles).toHaveLength(2)
      expect(listFiles.map(f => f.key).sort()).toEqual(['list/file1.txt', 'list/file2.txt'])
    })

    test('list - 应该支持限制和偏移', async () => {
      const files = Array.from({ length: 5 }, (_, i) => ({
        key: `paginate/file${i + 1}.txt`,
        content: `Content ${i + 1}`
      }))

      for (const file of files) {
        await adapter.put(file.key, file.content)
      }

      const page1 = await adapter.list('paginate/', { limit: 2, offset: 0 })
      expect(page1).toHaveLength(2)

      const page2 = await adapter.list('paginate/', { limit: 2, offset: 2 })
      expect(page2).toHaveLength(2)

      const page3 = await adapter.list('paginate/', { limit: 2, offset: 4 })
      expect(page3).toHaveLength(1)
    })
  })

  describe('文件夹操作', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('createFolder - 应该能够创建文件夹', async () => {
      const folderPath = 'test-folder'
      
      await adapter.createFolder(folderPath)
      
      const fullPath = join(tempDir, folderPath)
      const stats = await stat(fullPath)
      expect(stats.isDirectory()).toBe(true)
    })

    test('createFolder - 应该能够创建嵌套文件夹', async () => {
      const folderPath = 'nested/sub/folder'
      
      await adapter.createFolder(folderPath)
      
      const fullPath = join(tempDir, folderPath)
      const stats = await stat(fullPath)
      expect(stats.isDirectory()).toBe(true)
    })

    test('deleteFolder - 应该能够删除空文件夹', async () => {
      const folderPath = 'empty-folder'
      
      await adapter.createFolder(folderPath)
      await adapter.deleteFolder(folderPath)
      
      const fullPath = join(tempDir, folderPath)
      await expect(stat(fullPath)).rejects.toThrow()
    })

    test('deleteFolder - 应该能够递归删除文件夹', async () => {
      const folderPath = 'folder-with-content'
      
      await adapter.createFolder(folderPath)
      await adapter.put(`${folderPath}/file.txt`, 'Content')
      
      await adapter.deleteFolder(folderPath, true)
      
      const fullPath = join(tempDir, folderPath)
      await expect(stat(fullPath)).rejects.toThrow()
    })
  })

  describe('文件复制和移动', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('copy - 应该能够复制文件', async () => {
      const sourceKey = 'source.txt'
      const destKey = 'destination.txt'
      const content = 'Copy me!'
      const metadata = { contentType: 'text/plain' }

      await adapter.put(sourceKey, content, { metadata })
      const result = await adapter.copy(sourceKey, destKey)

      expect(result.key).toBe(destKey)
      
      // 源文件应该还存在
      expect(await adapter.exists(sourceKey)).toBe(true)
      
      // 目标文件应该被创建
      const destFile = await adapter.get(destKey)
      expect(destFile!.data.toString()).toBe(content)
      expect(destFile!.metadata.contentType).toBe('text/plain')
    })

    test('copy - 复制不存在的文件应该抛出错误', async () => {
      await expect(
        adapter.copy('non-existent.txt', 'destination.txt')
      ).rejects.toThrow()
    })

    test('move - 应该能够移动文件', async () => {
      const sourceKey = 'move-source.txt'
      const destKey = 'move-destination.txt'
      const content = 'Move me!'

      await adapter.put(sourceKey, content)
      const result = await adapter.move(sourceKey, destKey)

      expect(result.key).toBe(destKey)
      
      // 源文件应该不存在
      expect(await adapter.exists(sourceKey)).toBe(false)
      
      // 目标文件应该存在
      const destFile = await adapter.get(destKey)
      expect(destFile!.data.toString()).toBe(content)
    })
  })

  describe('流式操作', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('createReadStream - 应该能够创建读取流', async () => {
      const key = 'stream-read.txt'
      const content = 'Stream content'

      await adapter.put(key, content)
      const stream = await adapter.createReadStream(key)

      const chunks: Uint8Array[] = []
      const reader = stream.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }

      const result = Buffer.concat(chunks.map(c => Buffer.from(c)))
      expect(result.toString()).toBe(content)
    })

    test('createReadStream - 不存在的文件应该抛出错误', async () => {
      await expect(
        adapter.createReadStream('non-existent.txt')
      ).rejects.toThrow()
    })

    test('createWriteStream - 应该能够创建写入流', async () => {
      const key = 'stream-write.txt'
      const content = 'Written via stream'

      const stream = await adapter.createWriteStream(key)
      const writer = stream.getWriter()

      await writer.write(new TextEncoder().encode(content))
      await writer.close()

      const file = await adapter.get(key)
      expect(file!.data.toString()).toBe(content)
    })
  })

  describe('路径安全', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('应该防止路径遍历攻击', async () => {
      const maliciousKeys = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd',
        'C:\\Windows\\System32\\config\\SAM'
      ]

      for (const key of maliciousKeys) {
        await adapter.put(key, 'malicious content')
        
        // 文件应该被存储在安全的位置（tempDir 内）
        const file = await adapter.get(key)
        expect(file).not.toBeNull()
        
        // 清理
        await adapter.delete(key)
      }
    })
  })

  describe('错误处理', () => {
    test('未连接时操作应该抛出错误', async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      // 不调用 connect()

      await expect(adapter.put('key', 'value')).rejects.toThrow('存储未连接')
      await expect(adapter.get('key')).rejects.toThrow('存储未连接')
      await expect(adapter.delete('key')).rejects.toThrow('存储未连接')
    })

    test('断开连接后操作应该抛出错误', async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
      await adapter.disconnect()

      await expect(adapter.put('key', 'value')).rejects.toThrow('存储未连接')
    })
  })

  describe('URL 生成', () => {
    beforeEach(async () => {
      const config = createTestStorageConfig(tempDir)
      adapter = new LocalStorageAdapter(config)
      await adapter.connect()
    })

    test('getSignedUrl - 本地存储不支持签名 URL', async () => {
      await expect(
        adapter.getSignedUrl('test.txt', 'read')
      ).rejects.toThrow('本地存储不支持签名 URL')
    })

    test('getPublicUrl - 应该返回文件路径', async () => {
      const key = 'public-test.txt'
      const url = adapter.getPublicUrl(key)
      
      expect(url).toContain('file://')
      expect(url).toContain(key)
    })
  })
})