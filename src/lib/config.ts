import { env } from './env'
import type { DatabaseConfig } from './interfaces/database'
import type { CacheConfig } from './interfaces/cache'
import type { FileConfig } from './interfaces/file'

// 系统配置
export interface SystemConfig {
  database: DatabaseConfig
  cache: CacheConfig
  file: FileConfig
  server: {
    port: number
    host?: string
    cors: {
      origin: string | string[]
      credentials: boolean
    }
  }
  security: {
    jwtSecret: string
    encryptionKey: string
    bcryptRounds: number
  }
  features: {
    enableWebUI: boolean
    enableAPI: boolean
    enableMetrics: boolean
    enableRateLimit: boolean
  }
}

// 根据环境变量生成配置
export function createSystemConfig(): SystemConfig {
  // 检测部署环境
  const isVercel = process.env.VERCEL === '1'
  const isPostgreSQL = env.DATABASE_URL.includes('postgresql')
  
  // 数据库配置 - 根据部署环境自动选择
  const databaseConfig: DatabaseConfig = isPostgreSQL ? {
    // PostgreSQL - 明确指定 PostgreSQL
    type: 'postgresql',
    url: env.DATABASE_URL,
    options: {
      maxConnections: env.NODE_ENV === 'production' ? 10 : 5,
      connectionTimeout: 30000,
      queryTimeout: 60000,
      ssl: env.NODE_ENV === 'production'
    }
  } : {
    // SQLite - 本地开发、Docker 和 Vercel 部署
    type: 'sqlite',
    url: env.DATABASE_URL,
    options: {
      maxConnections: 1, // SQLite 是单连接
      connectionTimeout: 30000,
      queryTimeout: 60000,
    },
    // Vercel 环境使用 Blob 存储
    blob: isVercel ? {
      enabled: true,
      key: 'llmgw-database.db',
      syncInterval: 300, // 5 分钟同步一次
      backupCount: 5 // 保留 5 个备份
    } : undefined
  } as any

  // 缓存配置
  const cacheConfig: CacheConfig = {
    type: env.REDIS_URL ? 'redis' : 'memory',
    url: env.REDIS_URL,
    options: {
      defaultTtl: 3600, // 1小时
      keyPrefix: 'llmgw:',
      maxMemory: env.NODE_ENV === 'production' ? 512 * 1024 * 1024 : 128 * 1024 * 1024, // 生产环境512MB，开发环境128MB
    }
  }

  // 文件存储配置
  const fileConfig: FileConfig = env.BLOB_READ_WRITE_TOKEN ? {
    type: 'vercel-blob',
    options: {
      token: env.BLOB_READ_WRITE_TOKEN,
      multipart: true
    }
  } : {
    type: 'local',
    options: {
      rootPath: './data/files',
      createDirectories: true,
      permissions: {
        file: 0o644,
        directory: 0o755
      }
    }
  }

  return {
    database: databaseConfig,
    cache: cacheConfig,
    file: fileConfig,
    server: {
      port: env.PORT,
      cors: {
        origin: env.NODE_ENV === 'production' ? env.NEXT_PUBLIC_APP_URL : true,
        credentials: true
      }
    },
    security: {
      jwtSecret: env.JWT_SECRET,
      encryptionKey: env.ENCRYPTION_MASTER_KEY,
      bcryptRounds: 12
    },
    features: {
      enableWebUI: true,
      enableAPI: true,
      enableMetrics: true,
      enableRateLimit: env.NODE_ENV === 'production'
    }
  }
}

// 全局配置实例
export const systemConfig = createSystemConfig()

// 配置验证
export function validateConfig(config: SystemConfig): void {
  // 验证必需的配置
  if (!config.security.jwtSecret || config.security.jwtSecret.length < 32) {
    throw new Error('JWT Secret 至少需要 32 个字符')
  }

  if (!config.security.encryptionKey || config.security.encryptionKey.length < 32) {
    throw new Error('加密密钥至少需要 32 个字符')
  }

  // 验证数据库配置
  if (!config.database.url) {
    throw new Error('数据库 URL 不能为空')
  }

  // 验证文件存储配置
  if (config.file.type === 'vercel-blob') {
    const options = config.file.options as any
    if (!options.token) {
      throw new Error('Vercel Blob 存储需要配置 token')
    }
  }

  console.log('✅ 系统配置验证通过')
}

// 配置摘要信息（用于日志记录，不包含敏感信息）
export function getConfigSummary(config: SystemConfig): Record<string, any> {
  return {
    database: {
      type: config.database.type,
      url: config.database.url.includes('postgresql') ? 'postgresql://***' : 
           config.database.url.replace(/\/[^/]+\.db$/, '/*****.db')
    },
    cache: {
      type: config.cache.type,
      hasUrl: !!config.cache.url
    },
    file: {
      type: config.file.type
    },
    server: {
      port: config.server.port,
      cors: config.server.cors.origin
    },
    features: config.features,
    environment: env.NODE_ENV
  }
}