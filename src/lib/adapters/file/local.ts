import fs from 'fs/promises'
import fss from 'fs'
import path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import crypto from 'crypto'
import type {
  FileAdapter,
  FileConfig,
  FileStorage,
  FileStorageStat,
  FileResult,
  FileOptions,
  FileMetadata,
  ListOptions,
  LocalFileOptions,
  FileConnectionError,
  FileNotFoundError,
  FilePermissionError
} from '../../interfaces/file'

export class LocalFileAdapter implements FileAdapter {
  private config: FileConfig
  private rootPath: string
  private connected = false

  constructor(config: FileConfig) {
    this.config = config
    const options = config.options as LocalFileOptions
    this.rootPath = path.resolve(options.rootPath)
  }

  async connect(): Promise<void> {
    if (this.connected) return

    try {
      const options = this.config.options as LocalFileOptions
      
      // 确保根目录存在
      if (options.createDirectories !== false) {
        await fs.mkdir(this.rootPath, { recursive: true })
      }

      // 检查目录权限
      await fs.access(this.rootPath, fss.constants.R_OK | fss.constants.W_OK)
      
      this.connected = true
    } catch (error) {
      throw new FileConnectionError('本地文件存储连接失败', error as Error)
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
      const filePath = this.getFilePath(key)
      const fileDir = path.dirname(filePath)

      // 确保目录存在
      await fs.mkdir(fileDir, { recursive: true })

      // 检查是否允许覆盖
      if (options?.overwrite === false) {
        try {
          await fs.access(filePath)
          throw new Error(`文件已存在: ${key}`)
        } catch (error: any) {
          if (error.code !== 'ENOENT') throw error
        }
      }

      // 转换数据为 Buffer
      const buffer = Buffer.isBuffer(data) ? data : 
                    data instanceof Uint8Array ? Buffer.from(data) :
                    Buffer.from(data, 'utf8')

      // 写入文件
      await fs.writeFile(filePath, buffer)

      // 设置文件权限
      const fileOptions = this.config.options as LocalFileOptions
      if (fileOptions.permissions?.file) {
        await fs.chmod(filePath, fileOptions.permissions.file)
      }

      // 写入元数据
      if (options?.metadata) {
        await this.writeMetadata(key, options.metadata)
      }

      const stat = await fs.stat(filePath)
      
      return {
        key,
        size: stat.size,
        etag: this.generateETag(buffer),
        metadata: options?.metadata
      }
    } catch (error) {
      throw new FilePermissionError(`写入文件失败: ${key}`, error as Error)
    }
  }

  async get(key: string): Promise<FileStorage | null> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const filePath = this.getFilePath(key)
      const data = await fs.readFile(filePath)
      const stat = await this.stat(key)
      const metadata = await this.readMetadata(key)

      if (!stat) return null

      return {
        key,
        data,
        metadata: metadata || {},
        stat
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw new FilePermissionError(`读取文件失败: ${key}`, error)
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const filePath = this.getFilePath(key)
      await fs.unlink(filePath)
      
      // 删除元数据文件
      try {
        const metadataPath = this.getMetadataPath(key)
        await fs.unlink(metadataPath)
      } catch {
        // 忽略元数据文件不存在的错误
      }

      return true
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return false
      }
      throw new FilePermissionError(`删除文件失败: ${key}`, error)
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const filePath = this.getFilePath(key)
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async putMany(items: { key: string; data: Buffer | string | Uint8Array; options?: FileOptions }[]): Promise<FileResult[]> {
    const results: FileResult[] = []
    for (const item of items) {
      const result = await this.put(item.key, item.data, item.options)
      results.push(result)
    }
    return results
  }

  async getMany(keys: string[]): Promise<(FileStorage | null)[]> {
    const results: (FileStorage | null)[] = []
    for (const key of keys) {
      const result = await this.get(key)
      results.push(result)
    }
    return results
  }

  async deleteMany(keys: string[]): Promise<boolean[]> {
    const results: boolean[] = []
    for (const key of keys) {
      const result = await this.delete(key)
      results.push(result)
    }
    return results
  }

  async stat(key: string): Promise<FileStorageStat | null> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const filePath = this.getFilePath(key)
      const stat = await fs.stat(filePath)
      const metadata = await this.readMetadata(key)

      return {
        key,
        size: stat.size,
        lastModified: stat.mtime,
        contentType: metadata?.contentType,
        etag: await this.generateFileETag(filePath),
        metadata: metadata || {}
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw new FilePermissionError(`获取文件信息失败: ${key}`, error)
    }
  }

  async list(prefix?: string, options?: ListOptions): Promise<FileStorage[]> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    try {
      const searchPath = prefix ? path.join(this.rootPath, prefix) : this.rootPath
      const files: FileStorage[] = []

      await this.walkDirectory(searchPath, async (filePath) => {
        const relativePath = path.relative(this.rootPath, filePath)
        const key = relativePath.replace(/\\/g, '/')

        // 跳过元数据文件
        if (key.endsWith('.metadata.json')) return

        // 应用前缀过滤
        if (prefix && !key.startsWith(prefix)) return

        try {
          const file = await this.get(key)
          if (file) {
            files.push(file)
          }
        } catch {
          // 忽略无法读取的文件
        }

        // 应用限制
        if (options?.limit && files.length >= options.limit) {
          return false // 停止遍历
        }
      }, options?.recursive !== false)

      // 应用偏移量
      const offset = options?.offset || 0
      return files.slice(offset)
    } catch (error) {
      throw new FilePermissionError('列出文件失败', error as Error)
    }
  }

  async createReadStream(key: string): Promise<ReadableStream> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    const filePath = this.getFilePath(key)
    
    if (!await this.exists(key)) {
      throw new FileNotFoundError(key)
    }

    const nodeStream = createReadStream(filePath)
    
    return new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        
        nodeStream.on('end', () => {
          controller.close()
        })
        
        nodeStream.on('error', (error) => {
          controller.error(error)
        })
      },
      
      cancel() {
        nodeStream.destroy()
      }
    })
  }

  async createWriteStream(key: string, options?: FileOptions): Promise<WritableStream> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    const filePath = this.getFilePath(key)
    const fileDir = path.dirname(filePath)

    // 确保目录存在
    await fs.mkdir(fileDir, { recursive: true })

    const nodeStream = createWriteStream(filePath)

    return new WritableStream({
      write(chunk) {
        return new Promise((resolve, reject) => {
          nodeStream.write(chunk, (error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      },
      
      close() {
        return new Promise((resolve, reject) => {
          nodeStream.end((error) => {
            if (error) reject(error)
            else resolve()
          })
        })
      },
      
      abort(reason) {
        nodeStream.destroy()
        return Promise.reject(reason)
      }
    })
  }

  async getSignedUrl(key: string, action: 'read' | 'write', expiresIn = 3600): Promise<string> {
    // 本地存储不支持签名 URL
    throw new Error('本地文件存储不支持签名 URL')
  }

  getPublicUrl(key: string): string {
    // 本地存储返回文件路径
    return `file://${this.getFilePath(key)}`
  }

  async createFolder(folderPath: string): Promise<void> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    const fullPath = path.join(this.rootPath, folderPath)
    await fs.mkdir(fullPath, { recursive: true })

    const fileOptions = this.config.options as LocalFileOptions
    if (fileOptions.permissions?.directory) {
      await fs.chmod(fullPath, fileOptions.permissions.directory)
    }
  }

  async deleteFolder(folderPath: string, recursive = false): Promise<void> {
    if (!this.connected) throw new FileConnectionError('文件存储未连接')

    const fullPath = path.join(this.rootPath, folderPath)
    await fs.rmdir(fullPath, { recursive })
  }

  async copy(sourceKey: string, destinationKey: string): Promise<FileResult> {
    const sourceFile = await this.get(sourceKey)
    if (!sourceFile) {
      throw new FileNotFoundError(sourceKey)
    }

    return this.put(destinationKey, sourceFile.data, {
      metadata: sourceFile.metadata
    })
  }

  async move(sourceKey: string, destinationKey: string): Promise<FileResult> {
    const result = await this.copy(sourceKey, destinationKey)
    await this.delete(sourceKey)
    return result
  }

  // 私有方法
  private getFilePath(key: string): string {
    // 防止路径遍历攻击
    const normalizedKey = key.replace(/\.\./g, '').replace(/^\/+/, '')
    return path.join(this.rootPath, normalizedKey)
  }

  private getMetadataPath(key: string): string {
    return this.getFilePath(key) + '.metadata.json'
  }

  private async writeMetadata(key: string, metadata: FileMetadata): Promise<void> {
    const metadataPath = this.getMetadataPath(key)
    const metadataDir = path.dirname(metadataPath)
    
    await fs.mkdir(metadataDir, { recursive: true })
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
  }

  private async readMetadata(key: string): Promise<FileMetadata | null> {
    try {
      const metadataPath = this.getMetadataPath(key)
      const content = await fs.readFile(metadataPath, 'utf8')
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  private generateETag(data: Buffer): string {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  private async generateFileETag(filePath: string): Promise<string> {
    const data = await fs.readFile(filePath)
    return this.generateETag(data)
  }

  private async walkDirectory(
    dirPath: string,
    callback: (filePath: string) => Promise<boolean | void>,
    recursive = true
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isFile()) {
          const shouldContinue = await callback(fullPath)
          if (shouldContinue === false) break
        } else if (entry.isDirectory() && recursive) {
          await this.walkDirectory(fullPath, callback, recursive)
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }
}