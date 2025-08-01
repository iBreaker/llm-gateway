// Next.js 服务器端系统初始化
import { initializeSystem } from './init'
import type { DatabaseAdapter } from './interfaces/database'
import type { CacheAdapter } from './interfaces/cache'

let systemInitialized = false
let systemServices: {
  database: DatabaseAdapter
  cache: CacheAdapter
} | null = null

// 确保系统只初始化一次（单例模式）
export async function ensureSystemInitialized() {
  if (systemInitialized && systemServices) {
    return systemServices
  }

  console.log('🔄 初始化 Next.js 服务器端系统...')
  
  try {
    const services = await initializeSystem()
    systemServices = services
    systemInitialized = true
    
    console.log('✅ Next.js 服务器端系统初始化完成')
    return services
  } catch (error) {
    console.error('❌ Next.js 服务器端系统初始化失败:', error)
    throw error
  }
}

// 获取数据库实例（用于 API 路由）
export async function getDatabase(): Promise<DatabaseAdapter> {
  const services = await ensureSystemInitialized()
  return services.database
}

// 获取缓存实例（用于 API 路由）
export async function getCache(): Promise<CacheAdapter> {
  const services = await ensureSystemInitialized()
  return services.cache
}



// 健康检查（用于 API 路由）
export async function checkSystemHealth() {
  if (!systemInitialized || !systemServices) {
    return {
      status: 'unhealthy',
      message: '系统未初始化',
      services: { database: false, cache: false }
    }
  }

  try {
    const { database, cache } = systemServices
    const services = {
      database: database.isConnected(),
      cache: cache.isConnected()
    }

    const allHealthy = Object.values(services).every(Boolean)
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      message: allHealthy ? '所有服务正常' : '部分服务异常',
      services
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `健康检查失败: ${error}`,
      services: { database: false, cache: false, file: false }
    }
  }
}