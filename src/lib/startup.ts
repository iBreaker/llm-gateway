/**
 * 应用启动初始化脚本
 * 负责启动各种后台服务
 */

import { prisma } from './prisma'
import { startGlobalTokenRefresh } from './services/oauth-token-manager'

let isInitialized = false

/**
 * 应用启动初始化
 */
export async function initializeApp(): Promise<void> {
  if (isInitialized) {
    console.log('应用已经初始化，跳过重复初始化')
    return
  }

  try {
    console.log('开始应用初始化...')

    // 启动OAuth token自动刷新服务
    console.log('启动OAuth token自动刷新服务...')
    startGlobalTokenRefresh(prisma)

    // 检查数据库连接
    console.log('检查数据库连接...')
    await prisma.$connect()
    console.log('数据库连接成功')

    // 输出当前OAuth账号状态
    const oauthAccounts = await prisma.upstreamAccount.findMany({
      where: { type: 'ANTHROPIC_OAUTH' },
      select: { id: true, name: true, status: true }
    })
    
    console.log(`发现 ${oauthAccounts.length} 个OAuth账号:`)
    oauthAccounts.forEach(account => {
      console.log(`  - 账号 ${account.id}: ${account.name} (${account.status})`)
    })

    isInitialized = true
    console.log('应用初始化完成')

  } catch (error: any) {
    console.error('应用初始化失败:', error)
    throw error
  }
}

/**
 * 优雅关闭应用
 */
export async function shutdownApp(): Promise<void> {
  try {
    console.log('开始应用关闭...')

    // 停止OAuth token自动刷新服务
    const { stopGlobalTokenRefresh } = await import('./services/oauth-token-manager')
    stopGlobalTokenRefresh()

    // 关闭数据库连接
    await prisma.$disconnect()
    
    console.log('应用关闭完成')

  } catch (error: any) {
    console.error('应用关闭时出错:', error)
    throw error
  }
}

// 监听进程退出信号
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    console.log('收到SIGINT信号，开始优雅关闭...')
    await shutdownApp()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('收到SIGTERM信号，开始优雅关闭...')
    await shutdownApp()
    process.exit(0)
  })
}