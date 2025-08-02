import { PrismaClient } from '@prisma/client'
import { AnthropicClient } from './anthropic/client'

const prisma = new PrismaClient()

export interface HealthCheckResult {
  accountId: bigint
  success: boolean
  responseTime?: number
  error?: string
  timestamp: Date
}

/**
 * 健康检查服务
 */
export class HealthChecker {
  private isRunning: boolean = false
  private checkInterval: NodeJS.Timeout | null = null

  /**
   * 启动定期健康检查
   */
  startPeriodicHealthCheck(intervalMinutes: number = 5): void {
    if (this.isRunning) {
      console.warn('健康检查已在运行中')
      return
    }

    console.log(`启动定期健康检查，间隔: ${intervalMinutes} 分钟`)
    
    this.isRunning = true
    
    // 立即执行一次
    this.checkAllAccounts()
    
    // 设置定期执行
    this.checkInterval = setInterval(() => {
      this.checkAllAccounts()
    }, intervalMinutes * 60 * 1000)
  }

  /**
   * 停止定期健康检查
   */
  stopPeriodicHealthCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    this.isRunning = false
    console.log('已停止定期健康检查')
  }

  /**
   * 检查所有账号的健康状态
   */
  async checkAllAccounts(): Promise<HealthCheckResult[]> {
    try {
      console.log('开始健康检查...')
      
      const accounts = await prisma.upstreamAccount.findMany({
        where: {
          status: { in: ['ACTIVE', 'PENDING', 'ERROR'] }
        }
      })

      const results: HealthCheckResult[] = []
      
      // 并发检查所有账号（限制并发数）
      const batchSize = 5
      for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize)
        const batchResults = await Promise.allSettled(
          batch.map(account => this.checkSingleAccount(account))
        )

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            results.push(result.value)
          }
        }
      }

      console.log(`健康检查完成，检查了 ${results.length} 个账号`)
      return results

    } catch (error) {
      console.error('健康检查失败:', error)
      return []
    }
  }

  /**
   * 检查单个账号的健康状态
   */
  async checkSingleAccount(account: any): Promise<HealthCheckResult> {
    const startTime = Date.now()
    const result: HealthCheckResult = {
      accountId: account.id,
      success: false,
      timestamp: new Date()
    }

    try {
      if (account.type === 'ANTHROPIC_API') {
        await this.checkAnthropicAccount(account)
      } else {
        result.error = `暂不支持的账号类型: ${account.type}`
      }

      result.success = true
      result.responseTime = Date.now() - startTime

    } catch (error: any) {
      result.success = false
      result.error = error.message
      result.responseTime = Date.now() - startTime
    }

    // 更新数据库中的健康状态
    await this.updateAccountHealthStatus(account.id, result)

    return result
  }

  /**
   * 检查Anthropic API账号
   */
  private async checkAnthropicAccount(account: any): Promise<void> {
    const credentials = typeof account.credentials === 'string' 
      ? JSON.parse(account.credentials) 
      : account.credentials

    if (!credentials.api_key) {
      throw new Error('缺少API Key')
    }

    const client = new AnthropicClient(credentials.api_key, credentials.base_url)
    
    console.log(`检查账号 ${account.id} (${account.name}) 的健康状态...`)
    
    // 使用 validateApiKey 方法，它能处理代理服务器的响应头问题
    const validationResult = await client.validateApiKey()
    
    console.log(`账号 ${account.id} 验证结果:`, validationResult)
    
    if (!validationResult.valid) {
      const errorMessage = validationResult.error || 'API Key验证失败'
      console.error(`账号 ${account.id} 健康检查失败: ${errorMessage}`)
      if (validationResult.details) {
        console.error('错误详情:', validationResult.details)
      }
      throw new Error(errorMessage)
    }
    
    console.log(`账号 ${account.id} 健康检查成功`)
  }

  /**
   * 更新账号健康状态
   */
  private async updateAccountHealthStatus(
    accountId: bigint, 
    result: HealthCheckResult
  ): Promise<void> {
    try {
      const healthStatus = {
        status: result.success ? 'success' : 'error',
        responseTime: result.responseTime,
        error: result.error,
        lastCheck: result.timestamp.toISOString()
      }

      const updateData: any = {
        lastHealthCheck: result.timestamp,
        healthStatus: JSON.parse(JSON.stringify(healthStatus))
      }

      // 根据健康检查结果更新状态
      if (result.success) {
        updateData.status = 'ACTIVE'
      } else {
        // 只有在多次失败后才标记为错误
        const account = await prisma.upstreamAccount.findUnique({
          where: { id: accountId },
          select: { healthStatus: true, errorCount: true }
        })

        if (account) {
          const previousHealthStatus = account.healthStatus as any
          
          // 如果连续失败3次或更多，标记为错误
          if (previousHealthStatus?.status === 'error' && Number(account.errorCount) >= 3) {
            updateData.status = 'ERROR'
          }
          // 否则保持当前状态，但更新健康信息
        }
      }

      await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: updateData
      })

    } catch (error) {
      console.error(`更新账号 ${accountId} 健康状态失败:`, error)
    }
  }

  /**
   * 获取健康检查统计
   */
  async getHealthStats(): Promise<{
    totalAccounts: number
    healthyAccounts: number
    unhealthyAccounts: number
    lastCheckTime: Date | null
    avgResponseTime: number
  }> {
    const accounts = await prisma.upstreamAccount.findMany({
      select: {
        healthStatus: true,
        lastHealthCheck: true
      }
    })

    let healthyCount = 0
    let unhealthyCount = 0
    let totalResponseTime = 0
    let responseTimeCount = 0
    let lastCheckTime: Date | null = null

    for (const account of accounts) {
      const healthStatus = account.healthStatus as any
      
      if (healthStatus?.status === 'success') {
        healthyCount++
        if (healthStatus.responseTime) {
          totalResponseTime += healthStatus.responseTime
          responseTimeCount++
        }
      } else if (healthStatus?.status === 'error') {
        unhealthyCount++
      }

      if (account.lastHealthCheck && (!lastCheckTime || account.lastHealthCheck > lastCheckTime)) {
        lastCheckTime = account.lastHealthCheck
      }
    }

    return {
      totalAccounts: accounts.length,
      healthyAccounts: healthyCount,
      unhealthyAccounts: unhealthyCount,
      lastCheckTime,
      avgResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0
    }
  }

  /**
   * 清理资源
   */
  async disconnect(): Promise<void> {
    this.stopPeriodicHealthCheck()
    await prisma.$disconnect()
  }
}

// 创建单例实例
export const healthChecker = new HealthChecker()

// 在开发环境中启动健康检查（生产环境应该通过环境变量控制）
if (process.env.NODE_ENV === 'development' && process.env.ENABLE_HEALTH_CHECK === 'true') {
  healthChecker.startPeriodicHealthCheck(10) // 10分钟间隔
}