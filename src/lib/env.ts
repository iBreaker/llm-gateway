import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  
  // 数据库 - 使用 Vercel 标准环境变量
  POSTGRES_URL: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  DATABASE_URL: z.string().default('./data/dev.db'),
  
  // 缓存 (可选)
  REDIS_URL: z.string().optional(),
  
  // 文件存储
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  
  // 安全
  JWT_SECRET: z.string().min(32, 'JWT Secret 至少需要 32 个字符'),
  ENCRYPTION_MASTER_KEY: z.string().min(32, '加密密钥至少需要 32 个字符'),
  
  // OAuth 配置
  CLAUDE_OAUTH_CLIENT_ID: z.string().optional(),
  CLAUDE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GEMINI_OAUTH_CLIENT_ID: z.string().optional(),
  GEMINI_OAUTH_CLIENT_SECRET: z.string().optional(),
  
  // 应用配置
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  
  // 日志和监控
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SENTRY_DSN: z.string().optional(),
  ANALYTICS_ID: z.string().optional(),
})

function getEnv() {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    console.error('❌ 环境变量验证失败:', error)
    throw new Error('环境变量配置错误')
  }
}

export const env = getEnv()