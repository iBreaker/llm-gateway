import { env } from './env'
import type { DatabaseConfig } from './interfaces/database'
import type { CacheConfig } from './interfaces/cache'
import { getDatabaseConfig, validateDatabaseConfig } from './utils/database-config'

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
  // 使用统一的数据库配置逻辑
  const databaseConfig = getDatabaseConfig()

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

  // 使用统一的数据库配置验证
  validateDatabaseConfig(config.database)

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