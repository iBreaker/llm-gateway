// 文件存储接口定义
export interface FileAdapter {
  // 连接管理
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  
  // 文件操作
  put(key: string, data: Buffer | string | Uint8Array, options?: FileOptions): Promise<FileResult>
  get(key: string): Promise<FileStorage | null>
  delete(key: string): Promise<boolean>
  exists(key: string): Promise<boolean>
  
  // 批量操作
  putMany(items: { key: string; data: Buffer | string | Uint8Array; options?: FileOptions }[]): Promise<FileResult[]>
  getMany(keys: string[]): Promise<(FileStorage | null)[]>
  deleteMany(keys: string[]): Promise<boolean[]>
  
  // 文件信息
  stat(key: string): Promise<FileStorageStat | null>
  list(prefix?: string, options?: ListOptions): Promise<FileStorage[]>
  
  // 流式操作
  createReadStream(key: string): Promise<ReadableStream>
  createWriteStream(key: string, options?: FileOptions): Promise<WritableStream>
  
  // URL 生成 (用于直接访问)
  getSignedUrl(key: string, action: 'read' | 'write', expiresIn?: number): Promise<string>
  getPublicUrl(key: string): string
  
  // 文件夹操作
  createFolder(path: string): Promise<void>
  deleteFolder(path: string, recursive?: boolean): Promise<void>
  
  // 复制和移动
  copy(sourceKey: string, destinationKey: string): Promise<FileResult>
  move(sourceKey: string, destinationKey: string): Promise<FileResult>
}

export interface FileStorage {
  key: string
  data: Buffer
  metadata: FileMetadata
  stat: FileStorageStat
}

export interface FileStorageStat {
  key: string
  size: number
  lastModified: Date
  contentType?: string
  etag?: string
  metadata?: FileMetadata
}

export interface FileResult {
  key: string
  url?: string
  etag?: string
  size: number
  metadata?: FileMetadata
}

export interface FileMetadata {
  contentType?: string
  contentEncoding?: string
  contentDisposition?: string
  cacheControl?: string
  expires?: Date
  [key: string]: any
}

export interface FileOptions {
  contentType?: string
  metadata?: FileMetadata
  public?: boolean
  overwrite?: boolean
  encryption?: boolean
}

export interface ListOptions {
  limit?: number
  offset?: number
  recursive?: boolean
  includeMetadata?: boolean
}

export interface FileConfig {
  type: 'local' | 'vercel-blob' | 's3' | 'gcs'
  options: LocalFileOptions | VercelBlobOptions | S3Options | GcsOptions
}

// 本地文件配置
export interface LocalFileOptions {
  rootPath: string
  createDirectories?: boolean
  permissions?: {
    file?: number
    directory?: number
  }
}

// Vercel Blob 存储配置
export interface VercelBlobOptions {
  token: string
  baseUrl?: string
  multipart?: boolean
}

// S3 存储配置
export interface S3Options {
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  endpoint?: string
  forcePathStyle?: boolean
}

// Google Cloud Storage 配置
export interface GcsOptions {
  projectId: string
  bucket: string
  keyFilename?: string
  credentials?: object
}

// 错误类型
export class FileError extends Error {
  constructor(message: string, public code?: string, public cause?: Error) {
    super(message)
    this.name = 'FileError'
  }
}

export class FileNotFoundError extends FileError {
  constructor(key: string, cause?: Error) {
    super(`File not found: ${key}`, 'NOT_FOUND', cause)
    this.name = 'FileNotFoundError'
  }
}

export class FileConnectionError extends FileError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause)
    this.name = 'FileConnectionError'
  }
}

export class FilePermissionError extends FileError {
  constructor(message: string, cause?: Error) {
    super(message, 'PERMISSION_ERROR', cause)
    this.name = 'FilePermissionError'
  }
}

export class FileQuotaError extends FileError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUOTA_EXCEEDED', cause)
    this.name = 'FileQuotaError'
  }
}