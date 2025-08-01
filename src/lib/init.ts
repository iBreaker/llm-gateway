import { systemConfig, validateConfig, getConfigSummary } from './config'
import { ServiceRegistry } from './adapters'
import type { DatabaseAdapter, CacheAdapter, StorageAdapter } from './adapters'

// 系统初始化状态
let initialized = false
let shutdownHooks: (() => Promise<void>)[] = []

// 初始化系统
export async function initializeSystem(): Promise<{
  database: DatabaseAdapter
  cache: CacheAdapter
  storage: StorageAdapter
}> {
  if (initialized) {
    const registry = ServiceRegistry.getInstance()
    return {
      database: registry.getDatabase(),
      cache: registry.getCache(),
      storage: registry.getStorage()
    }
  }

  console.log('🚀 开始初始化 LLM Gateway 系统...')

  try {
    // 1. 验证配置
    validateConfig(systemConfig)
    console.log('📋 配置摘要:', JSON.stringify(getConfigSummary(systemConfig), null, 2))

    // 2. 初始化服务注册中心
    const registry = ServiceRegistry.getInstance()

    // 3. 初始化存储（SQLite 可能需要依赖存储适配器）
    console.log('💾 初始化存储适配器...')
    const storage = await registry.initializeStorage(systemConfig.storage)
    console.log(`✅ 存储适配器初始化完成 (${systemConfig.storage.type})`)

    // 4. 初始化数据库（SQLite 需要存储适配器支持 Blob）
    console.log('📊 初始化数据库适配器...')
    const database = await registry.initializeDatabaseWithStorage(systemConfig.database, storage)
    console.log(`✅ 数据库适配器初始化完成 (${systemConfig.database.type})`)

    // 5. 初始化缓存
    console.log('🗄️  初始化缓存适配器...')
    const cache = await registry.initializeCache(systemConfig.cache)
    console.log(`✅ 缓存适配器初始化完成 (${systemConfig.cache.type})`)

    // 6. 数据库迁移
    console.log('🔄 执行数据库迁移...')
    await database.migrate()
    console.log('✅ 数据库迁移完成')

    // 7. 注册关闭钩子
    registerShutdownHooks()

    initialized = true
    console.log('🎉 系统初始化完成!')

    return { database, cache, storage }
  } catch (error) {
    console.error('❌ 系统初始化失败:', error)
    
    // 清理已初始化的资源
    try {
      await ServiceRegistry.getInstance().shutdown()
    } catch (cleanupError) {
      console.error('清理资源时发生错误:', cleanupError)
    }
    
    throw error
  }
}

// 系统关闭
export async function shutdownSystem(): Promise<void> {
  if (!initialized) return

  console.log('🛑 开始关闭系统...')

  try {
    // 执行自定义关闭钩子
    for (const hook of shutdownHooks) {
      await hook()
    }

    // 关闭服务注册中心
    await ServiceRegistry.getInstance().shutdown()

    initialized = false
    console.log('✅ 系统关闭完成')
  } catch (error) {
    console.error('❌ 系统关闭时发生错误:', error)
    throw error
  }
}

// 添加关闭钩子
export function addShutdownHook(hook: () => Promise<void>): void {
  shutdownHooks.push(hook)
}

// 注册系统关闭钩子
function registerShutdownHooks(): void {
  // 优雅关闭处理
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n收到 ${signal} 信号，开始优雅关闭...`)
    
    try {
      await shutdownSystem()
      process.exit(0)
    } catch (error) {
      console.error('优雅关闭失败:', error)
      process.exit(1)
    }
  }

  // 监听系统信号
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))

  // 监听未捕获的异常
  process.on('uncaughtException', async (error) => {
    console.error('未捕获的异常:', error)
    try {
      await shutdownSystem()
    } catch (shutdownError) {
      console.error('关闭系统时发生错误:', shutdownError)
    }
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason, 'at Promise:', promise)
    try {
      await shutdownSystem()
    } catch (shutdownError) {
      console.error('关闭系统时发生错误:', shutdownError)
    }
    process.exit(1)
  })
}

// 健康检查
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy'
  services: {
    database: boolean
    cache: boolean
    storage: boolean
  }
  timestamp: string
}> {
  const timestamp = new Date().toISOString()

  if (!initialized) {
    return {
      status: 'unhealthy',
      services: { database: false, cache: false, storage: false },
      timestamp
    }
  }

  try {
    const registry = ServiceRegistry.getInstance()
    
    const services = {
      database: registry.getDatabase().isConnected(),
      cache: registry.getCache().isConnected(),
      storage: registry.getStorage().isConnected()
    }

    const status = Object.values(services).every(Boolean) ? 'healthy' : 'unhealthy'

    return { status, services, timestamp }
  } catch (error) {
    return {
      status: 'unhealthy',
      services: { database: false, cache: false, storage: false },
      timestamp
    }
  }
}

// 系统信息
export function getSystemInfo(): {
  version: string
  environment: string
  uptime: number
  memory: NodeJS.MemoryUsage
  initialized: boolean
} {
  return {
    version: process.env.npm_package_version || '0.1.0',
    environment: systemConfig.server.port ? 'server' : 'unknown',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    initialized
  }
}