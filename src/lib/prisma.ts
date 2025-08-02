import { PrismaClient } from '@prisma/client'

// 在 serverless 环境中为每个请求创建新的客户端实例
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.POSTGRES_URL + '&prepared_statements=false'
    }
  }
})