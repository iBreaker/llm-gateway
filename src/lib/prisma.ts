import { PrismaClient } from '@prisma/client'

// 全局Prisma实例，避免在开发环境中重复创建
declare global {
  var __prisma: PrismaClient | undefined
}

// 优化的Prisma客户端配置
const createPrismaClient = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: (process.env.POSTGRES_URL || '') + (process.env.POSTGRES_URL?.includes('?') ? '&' : '?') + 'prepared_statements=false'
      }
    },
    // 连接池配置
    // @ts-ignore
    __internal: {
      engine: {
        connectionLimit: 20, // 最大连接数
        poolTimeout: 10000, // 连接池超时 10秒
        // 连接重试配置
        retryLimit: 3,
        retryDelay: 1000
      }
    }
  })
}

// 使用单例模式，在开发环境中复用连接
export const prisma = globalThis.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma
}

// 优雅关闭处理
if (process.env.NODE_ENV === 'production') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}