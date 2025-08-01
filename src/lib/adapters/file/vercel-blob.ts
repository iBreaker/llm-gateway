import { put, del, head, list, copy as blobCopy } from '@vercel/blob'
import type {
  FileAdapter,
  FileConfig,
  FileStorage,
  FileStorageStat,
  FileResult,
  FileOptions,
  FileMetadata,
  ListOptions,
  VercelBlobOptions,
  FileConnectionError,
  FileNotFoundError,
  FilePermissionError
} from '../../interfaces/file'

export class VercelBlobFileAdapter implements FileAdapter {
  private config: FileConfig
  private token: string
  private baseUrl?: string
  private connected = false

  constructor(config: FileConfig) {
    this.config = config
    const options = config.options as VercelBlobOptions
    this.token = options.token
    this.baseUrl = options.baseUrl
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      // 验证 token 是否有效 - 尝试列出文件
      await list({ token: this.token, limit: 1 })
      this.connected = true
    } catch (error) {
      throw new FileConnectionError('Vercel Blob 连接失败', error as Error)
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async put(key: string, data: Buffer | string | Uint8Array, options?: FileOptions): Promise<FileResult> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      // 转换数据为适合的格式
      const content = Buffer.isBuffer(data) ? data : 
                    data instanceof Uint8Array ? Buffer.from(data) :
                    Buffer.from(data, 'utf8')

      const blob = await put(key, content, {
        access: options?.public ? 'public' : 'private',
        token: this.token,
        contentType: options?.contentType,
        addRandomSuffix: false
      })

      return {
        key,
        url: blob.url,
        size: content.length,
        metadata: options?.metadata
      }
    } catch (error) {
      throw new FilePermissionError(`上传文件失败: ${key}`, error as Error)
    }
  }

  async get(key: string): Promise<FileStorage | null> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      // Vercel Blob 不支持直接获取文件内容，需要通过 URL 下载
      const stat = await this.stat(key)
      if (!stat) return null

      // 从 blob URL 获取数据
      const response = await fetch(stat.etag!) // etag 包含了 blob URL
      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error(`HTTP ${response.status}`)
      }

      const data = Buffer.from(await response.arrayBuffer())

      return {
        key,
        data,
        metadata: stat.metadata || {},
        stat
      }
    } catch (error: any) {
      if (error.message.includes('404')) {
        return null
      }
      throw new FilePermissionError(`读取文件失败: ${key}`, error)
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      await del(key, { token: this.token })
      return true
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return false
      }
      throw new FilePermissionError(`删除文件失败: ${key}`, error)
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const stat = await this.stat(key)
      return stat !== null
    } catch {
      return false
    }
  }

  async putMany(items: { key: string; data: Buffer | string | Uint8Array; options?: FileOptions }[]): Promise<FileResult[]> {
    const results: FileResult[] = []
    
    // Vercel Blob 不支持批量上传，串行处理
    for (const item of items) {
      const result = await this.put(item.key, item.data, item.options)
      results.push(result)
    }
    
    return results
  }

  async getMany(keys: string[]): Promise<(FileStorage | null)[]> {
    const results: (FileStorage | null)[] = []
    
    // 并行获取文件
    const promises = keys.map(key => this.get(key))
    const files = await Promise.all(promises)
    
    return files
  }

  async deleteMany(keys: string[]): Promise<boolean[]> {
    const results: boolean[] = []
    
    // 并行删除文件
    const promises = keys.map(key => this.delete(key))
    const deleteResults = await Promise.all(promises)
    
    return deleteResults
  }

  async stat(key: string): Promise<FileStorageStat | null> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const blobs = await list({
        token: this.token,
        prefix: key,
        limit: 1000 // 获取所有匹配的文件
      })

      // 找到精确匹配的文件
      const blob = blobs.blobs.find(b => b.pathname === key)
      if (!blob) return null

      return {
        key,
        size: blob.size,
        lastModified: new Date(blob.uploadedAt),
        contentType: blob.contentType,
        etag: blob.url, // 使用 URL 作为 etag
        metadata: {}
      }
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        return null
      }
      throw new FilePermissionError(`获取文件信息失败: ${key}`, error)
    }
  }

  async list(prefix?: string, options?: ListOptions): Promise<FileStorage[]> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const blobs = await list({
        token: this.token,
        prefix,
        limit: options?.limit || 1000
      })

      const files: FileStorage[] = []
      
      for (const blob of blobs.blobs) {
        // 应用偏移量过滤
        if (options?.offset && files.length < options.offset) continue

        try {
          const file = await this.get(blob.pathname)
          if (file) {
            files.push(file)
          }
        } catch {
          // 忽略无法获取的文件
        }

        // 应用限制
        if (options?.limit && files.length >= options.limit) break
      }

      return files
    } catch (error) {
      throw new FilePermissionError('列出文件失败', error as Error)
    }
  }

  async createReadStream(key: string): Promise<ReadableStream> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    const stat = await this.stat(key)
    if (!stat) {
      throw new FileNotFoundError(key)
    }

    const response = await fetch(stat.etag!) // etag 包含了 blob URL
    if (!response.ok) {
      throw new FilePermissionError(`创建读取流失败: ${key}`)
    }

    if (!response.body) {
      throw new Error('Response body is null')
    }

    return response.body
  }

  async createWriteStream(key: string, options?: FileOptions): Promise<WritableStream> {
    // Vercel Blob 不支持流式写入，需要缓存数据然后上传
    const chunks: Uint8Array[] = []

    return new WritableStream({
      write(chunk) {
        chunks.push(new Uint8Array(chunk))
      },

      async close() {
        // 合并所有 chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        
        for (const chunk of chunks) {
          buffer.set(chunk, offset)
          offset += chunk.length
        }

        // 上传合并后的数据
        await put(key, buffer, {
          access: options?.public ? 'public' : 'private',
          token: this.token,
          contentType: options?.contentType,
          addRandomSuffix: false
        })
      }
    })
  }

  async getSignedUrl(key: string, action: 'read' | 'write', expiresIn = 3600): Promise<string> {
    // Vercel Blob 的 URL 本身就是签名的，直接返回 blob URL
    const stat = await this.stat(key)
    if (!stat) {
      throw new FileNotFoundError(key)
    }
    
    return stat.etag! // etag 包含了 blob URL
  }

  getPublicUrl(key: string): string {
    // 需要先获取 blob 的 URL，这是异步操作，这里只能返回基础路径
    return `${this.baseUrl || 'https://blob.vercel-storage.com'}/${key}`
  }

  async createFolder(folderPath: string): Promise<void> {
    // Vercel Blob 是平坦存储，不需要创建文件夹
    // 可以创建一个空的标记文件
    await this.put(`${folderPath}/.keep`, Buffer.from(''), {
      contentType: 'text/plain'
    })
  }

  async deleteFolder(folderPath: string, recursive = false): Promise<void> {
    if (!recursive) {
      // 只删除标记文件
      await this.delete(`${folderPath}/.keep`)
      return
    }

    // 递归删除所有文件
    const files = await this.list(folderPath)
    const keys = files.map(f => f.key)
    
    if (keys.length > 0) {
      await this.deleteMany(keys)
    }
  }

  async copy(sourceKey: string, destinationKey: string): Promise<FileResult> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      // Vercel Blob 支持直接复制
      const blob = await blobCopy(sourceKey, destinationKey, {
        token: this.token,
        addRandomSuffix: false
      })

      return {
        key: destinationKey,
        url: blob.url,
        size: blob.size
      }
    } catch (error) {
      // 如果直接复制失败，使用获取+上传的方式
      const sourceFile = await this.get(sourceKey)
      if (!sourceFile) {
        throw new FileNotFoundError(sourceKey)
      }

      return this.put(destinationKey, sourceFile.data, {
        metadata: sourceFile.metadata
      })
    }
  }

  async move(sourceKey: string, destinationKey: string): Promise<FileResult> {
    const result = await this.copy(sourceKey, destinationKey)
    await this.delete(sourceKey)
    return result
  }
}