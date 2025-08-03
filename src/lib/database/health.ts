import { prisma } from '@/lib/prisma'

/**
 * 数据库连接健康检查
 */
export async function checkDatabaseHealth(): Promise<{
  isHealthy: boolean
  responseTime?: number
  error?: string
}> {
  const startTime = Date.now()
  
  try {
    // 简单的查询测试连接
    await prisma.$queryRaw`SELECT 1`
    
    const responseTime = Date.now() - startTime
    
    return {
      isHealthy: true,
      responseTime
    }
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    return {
      isHealthy: false,
      responseTime,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 带重试的数据库操作
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error
      
      // 如果是最后一次尝试，抛出错误
      if (attempt === maxRetries) {
        throw lastError
      }
      
      // 检查是否是连接相关的错误
      const isConnectionError = lastError.message.includes('Engine is not yet connected') ||
                                lastError.message.includes('Connection') ||
                                lastError.message.includes('timeout') ||
                                lastError.message.includes('ECONNREFUSED')
      
      if (isConnectionError) {
        console.warn(`数据库操作失败，第 ${attempt} 次重试，${delay}ms 后重试:`, lastError.message)
        
        // 等待指数退避延迟
        await new Promise(resolve => setTimeout(resolve, delay * attempt))
      } else {
        // 非连接错误，直接抛出
        throw lastError
      }
    }
  }
  
  throw lastError!
}

/**
 * 确保数据库连接
 */
export async function ensureDatabaseConnection(): Promise<void> {
  try {
    await withDatabaseRetry(async () => {
      await prisma.$connect()
    })
  } catch (error) {
    console.error('无法建立数据库连接:', error)
    throw error
  }
}