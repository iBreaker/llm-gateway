import { env } from '../env'
import type { DatabaseConfig } from '../interfaces/database'

/**
 * 统一的数据库配置获取逻辑
 * 确保所有地方使用相同的环境变量优先级
 */
export function getDatabaseConfig(): DatabaseConfig {
  // 统一的环境变量优先级
  const databaseUrl = env.POSTGRES_URL_NON_POOLING || 
                     env.POSTGRES_URL || 
                     env.SUPABASE_URL || 
                     env.DATABASE_URL

  // 检测数据库类型
  const isPostgreSQL = databaseUrl && (
    databaseUrl.includes('postgresql') || 
    databaseUrl.includes('supabase')
  )

  // 根据部署环境和可用资源决定适配器类型
  const isVercel = process.env.VERCEL === '1'
  const hasSupabaseKeys = !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY)

  let type: DatabaseConfig['type']
  
  if (isPostgreSQL) {
    // PostgreSQL 环境，优先使用 Prisma
    type = 'prisma'
  } else {
    // 本地开发，使用 SQLite
    type = 'sqlite'
  }

  console.log('🔍 数据库配置决策:', {
    isVercel,
    hasSupabaseKeys,
    isPostgreSQL,
    selectedType: type,
    urlSource: env.POSTGRES_URL_NON_POOLING ? 'POSTGRES_URL_NON_POOLING' :
               env.POSTGRES_URL ? 'POSTGRES_URL' :
               env.SUPABASE_URL ? 'SUPABASE_URL' :
               env.DATABASE_URL ? 'DATABASE_URL' : 'default'
  })

  return {
    type,
    url: databaseUrl || './data/dev.db',
    options: {
      maxConnections: isVercel ? 5 : (process.env.NODE_ENV === 'production' ? 10 : 5),
      connectionTimeout: 10000,
      queryTimeout: 20000,
      ssl: process.env.NODE_ENV === 'production'
    }
  }
}

/**
 * 验证数据库配置的一致性
 */
export function validateDatabaseConfig(config: DatabaseConfig): void {
  if (!config.url) {
    throw new Error('数据库URL不能为空')
  }

  if (config.type === 'prisma' && !config.url.includes('postgresql')) {
    throw new Error('Prisma 适配器需要 PostgreSQL 数据库')
  }

  if (config.type === 'sqlite' && config.url.includes('postgresql')) {
    throw new Error('SQLite 适配器不支持 PostgreSQL URL')
  }

  console.log('✅ 数据库配置验证通过:', { type: config.type, hasUrl: !!config.url })
}