import { env } from './env'
import type { DatabaseConfig } from './interfaces/database'
import type { CacheConfig } from './interfaces/cache'

// 系统配置
export interface SystemConfig {
  database: DatabaseConfig
  cache: CacheConfig
  server: {
    port: number
    host?: string
    cors: {
      origin: string | string[] | boolean
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
  // 检测部署环境和数据库类型
  const isVercel = process.env.VERCEL === '1'
  
  // 根据 Vercel 标准环境变量确定数据库
  // Vercel 集成 Supabase 时自动提供这些环境变量
  const databaseUrl = env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL || env.SUPABASE_URL || env.DATABASE_URL
  const isPostgreSQL = databaseUrl && (databaseUrl.includes('postgresql') || databaseUrl.includes('supabase'))
  const hasSupabaseKeys = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY)
  
  // 在 Vercel 环境中强制使用 PostgreSQL/Supabase
  const shouldUsePostgreSQL = isPostgreSQL || (isVercel && env.SUPABASE_URL)
  
  // 调试信息
  console.log('🔍 数据库配置检测:', {
    isVercel,
    SUPABASE_URL: env.SUPABASE_URL ? 'SET' : 'NOT_SET',
    POSTGRES_URL: env.POSTGRES_URL ? 'SET' : 'NOT_SET',
    POSTGRES_URL_NON_POOLING: env.POSTGRES_URL_NON_POOLING ? 'SET' : 'NOT_SET',
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET',
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT_SET',
    hasSupabaseKeys,
    shouldUsePostgreSQL,
    detectedType: shouldUsePostgreSQL ? 'Prisma+PostgreSQL/Supabase' : 'SQLite'
  })
  
  // 数据库配置 - 根据部署环境自动选择
  const databaseConfig: DatabaseConfig = shouldUsePostgreSQL ? {
    // 使用 Prisma 连接 Supabase/PostgreSQL
    type: 'prisma',
    url: databaseUrl,
    options: {
      maxConnections: isVercel ? 5 : (env.NODE_ENV === 'production' ? 10 : 5),
      connectionTimeout: 10000, // 10秒连接超时，适合 Vercel
      queryTimeout: 20000, // 20秒查询超时，适合 Vercel
      ssl: env.NODE_ENV === 'production'
    }
  } : {
    // SQLite - 本地开发、Docker 和 Vercel 部署
    type: 'sqlite',
    url: env.DATABASE_URL,
    options: {
      maxConnections: 1, // SQLite 是单连接
      connectionTimeout: isVercel ? 5000 : 30000,  // Vercel 环境快速超时
      queryTimeout: isVercel ? 8000 : 60000,       // Vercel 环境快速超时
    },
    // Vercel 环境暂时禁用 Blob 存储，避免超时问题
    blob: false ? {
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

  return {
    database: databaseConfig,
    cache: cacheConfig,
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
    server: {
      port: config.server.port,
      cors: config.server.cors.origin
    },
    features: config.features,
    environment: env.NODE_ENV
  }
}