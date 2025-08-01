// 文件存储接口定义
export interface StorageAdapter {
  // 连接管理
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  
  // 文件操作
  put(key: string, data: Buffer | string | Uint8Array, options?: StorageOptions): Promise<StorageResult>
  get(key: string): Promise<StorageFile | null>
  delete(key: string): Promise<boolean>
  exists(key: string): Promise<boolean>
  
  // 批量操作
  putMany(items: { key: string; data: Buffer | string | Uint8Array; options?: StorageOptions }[]): Promise<StorageResult[]>
  getMany(keys: string[]): Promise<(StorageFile | null)[]>
  deleteMany(keys: string[]): Promise<boolean[]>
  
  // 文件信息
  stat(key: string): Promise<StorageFileStat | null>
  list(prefix?: string, options?: ListOptions): Promise<StorageFile[]>
  
  // 流式操作
  createReadStream(key: string): Promise<ReadableStream>
  createWriteStream(key: string, options?: StorageOptions): Promise<WritableStream>
  
  // URL 生成 (用于直接访问)
  getSignedUrl(key: string, action: 'read' | 'write', expiresIn?: number): Promise<string>
  getPublicUrl(key: string): string
  
  // 文件夹操作
  createFolder(path: string): Promise<void>
  deleteFolder(path: string, recursive?: boolean): Promise<void>
  
  // 复制和移动
  copy(sourceKey: string, destinationKey: string): Promise<StorageResult>
  move(sourceKey: string, destinationKey: string): Promise<StorageResult>
}

export interface StorageFile {
  key: string
  data: Buffer
  metadata: StorageMetadata
  stat: StorageFileStat
}

export interface StorageFileStat {
  key: string
  size: number
  lastModified: Date
  contentType?: string
  etag?: string
  metadata?: StorageMetadata
}

export interface StorageResult {
  key: string
  url?: string
  etag?: string
  size: number
  metadata?: StorageMetadata
}

export interface StorageMetadata {
  contentType?: string
  contentEncoding?: string
  contentDisposition?: string
  cacheControl?: string
  expires?: Date
  [key: string]: any
}

export interface StorageOptions {
  contentType?: string
  metadata?: StorageMetadata
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

export interface StorageConfig {
  type: 'local' | 'vercel-blob' | 's3' | 'gcs'
  options: LocalStorageOptions | VercelBlobOptions | S3Options | GcsOptions
}

// 本地存储配置
export interface LocalStorageOptions {
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
export class StorageError extends Error {
  constructor(message: string, public code?: string, public cause?: Error) {
    super(message)
    this.name = 'StorageError'
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string, cause?: Error) {
    super(`File not found: ${key}`, 'NOT_FOUND', cause)
    this.name = 'StorageNotFoundError'
  }
}

export class StorageConnectionError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause)
    this.name = 'StorageConnectionError'
  }
}

export class StoragePermissionError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'PERMISSION_ERROR', cause)
    this.name = 'StoragePermissionError'
  }
}

export class StorageQuotaError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUOTA_EXCEEDED', cause)
    this.name = 'StorageQuotaError'
  }
}