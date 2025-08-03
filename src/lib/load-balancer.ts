import { prisma } from '@/lib/prisma'

export interface UpstreamAccount {
  id: bigint
  name: string
  type: 'ANTHROPIC_API' | 'ANTHROPIC_OAUTH'
  email: string
  credentials: any
  config: any
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING'
  priority: number
  weight: number
  lastHealthCheck: Date | null
  healthStatus: any
  lastUsedAt: Date | null
  requestCount: bigint
  successCount: bigint  
  errorCount: bigint
  userId: bigint
  createdAt: Date
  updatedAt: Date
}

export interface LoadBalancerOptions {
  strategy?: 'weighted_round_robin' | 'priority_first' | 'least_connections'
  includeInactive?: boolean
  minHealthScore?: number
}

/**
 * 负载均衡器 - 选择最优的上游账号
 */
export class LoadBalancer {
  constructor() {
    // 使用统一的prisma实例
  }

  /**
   * 为指定用户和账号类型选择最优的上游账号
   */
  async selectAccount(
    userId: bigint, 
    accountType: 'ANTHROPIC_API' | 'ANTHROPIC_OAUTH' | 'ALL' = 'ALL',
    options: LoadBalancerOptions = {}
  ): Promise<UpstreamAccount | null> {
    
    const {
      strategy = 'weighted_round_robin',
      includeInactive = false,
      minHealthScore = 0.5
    } = options

    // 获取可用的上游账号
    const accounts = await this.getAvailableAccounts(userId, accountType, includeInactive)
    
    if (accounts.length === 0) {
      return null
    }

    // 过滤健康的账号
    const healthyAccounts = this.filterHealthyAccounts(accounts, minHealthScore)
    
    if (healthyAccounts.length === 0) {
      // 如果没有健康的账号，返回最近使用的账号
      return accounts.sort((a, b) => {
        const aTime = a.lastUsedAt?.getTime() || 0
        const bTime = b.lastUsedAt?.getTime() || 0
        return bTime - aTime
      })[0] || null
    }

    // 根据策略选择账号
    switch (strategy) {
      case 'priority_first':
        return this.selectByPriority(healthyAccounts)
      case 'least_connections':
        return this.selectByLeastConnections(healthyAccounts)
      case 'weighted_round_robin':
      default:
        return this.selectByWeightedRoundRobin(healthyAccounts)
    }
  }

  /**
   * 获取可用的上游账号
   */
  private async getAvailableAccounts(
    userId: bigint, 
    accountType: string, 
    includeInactive: boolean
  ): Promise<any[]> {
    const whereClause: any = {
      userId
    }

    // 如果指定了具体账号类型，添加类型过滤
    if (accountType !== 'ALL') {
      whereClause.type = accountType
    }

    if (!includeInactive) {
      // 默认只包含ACTIVE和PENDING状态的账号，排除INACTIVE和ERROR状态
      whereClause.status = { in: ['ACTIVE', 'PENDING'] }
    }

    const accounts = await prisma.upstreamAccount.findMany({
      where: whereClause,
      orderBy: [
        { priority: 'desc' },
        { weight: 'desc' },
        { createdAt: 'asc' }
      ]
    })

    return accounts
  }

  /**
   * 过滤健康的账号
   */
  private filterHealthyAccounts(accounts: any[], minHealthScore: number): any[] {
    return accounts.filter(account => {
      // 如果账号状态为错误，跳过
      if (account.status === 'ERROR') {
        return false
      }

      // 如果没有健康检查记录，包含在内
      if (!account.healthStatus || typeof account.healthStatus !== 'object') {
        return true
      }

      const healthStatus = account.healthStatus
      
      // 如果健康检查成功，包含在内
      if (healthStatus.status === 'success') {
        return true
      }

      // 如果健康检查失败但是最近的检查（小于5分钟），排除
      if (healthStatus.status === 'error') {
        const lastCheck = account.lastHealthCheck
        if (lastCheck && (Date.now() - lastCheck.getTime()) < 5 * 60 * 1000) {
          return false
        }
      }

      return true
    })
  }

  /**
   * 按优先级选择账号
   */
  private selectByPriority(accounts: any[]): any {
    // 按优先级排序，选择最高优先级的账号
    const sortedAccounts = accounts.sort((a, b) => b.priority - a.priority)
    const highestPriority = sortedAccounts[0].priority
    
    // 获取具有最高优先级的所有账号
    const topPriorityAccounts = accounts.filter(a => a.priority === highestPriority)
    
    // 在相同优先级中按权重选择
    return this.selectByWeightedRoundRobin(topPriorityAccounts)
  }

  /**
   * 按最少连接数选择账号
   */
  private selectByLeastConnections(accounts: any[]): any {
    // 按请求数排序，选择请求数最少的账号
    return accounts.sort((a, b) => {
      const aCount = Number(a.requestCount)
      const bCount = Number(b.requestCount)
      return aCount - bCount
    })[0]
  }

  /**
   * 按加权轮询选择账号
   */
  private selectByWeightedRoundRobin(accounts: any[]): any {
    // 计算总权重
    const totalWeight = accounts.reduce((sum, account) => sum + account.weight, 0)
    
    if (totalWeight === 0) {
      // 如果总权重为0，随机选择
      return accounts[Math.floor(Math.random() * accounts.length)]
    }

    // 生成随机数
    let random = Math.floor(Math.random() * totalWeight)
    
    // 根据权重选择账号
    for (const account of accounts) {
      random -= account.weight
      if (random < 0) {
        return account
      }
    }

    // 备选：返回第一个账号
    return accounts[0]
  }

  /**
   * 标记账号失败并选择备用账号
   */
  async markAccountFailedAndSelectAlternative(
    failedAccountId: bigint,
    userId: bigint,
    accountType: 'ANTHROPIC_API' | 'ANTHROPIC_OAUTH' | 'ALL' = 'ALL'
  ): Promise<UpstreamAccount | null> {
    try {
      // 1. 标记失败的账号为错误状态
      await prisma.upstreamAccount.update({
        where: { id: failedAccountId },
        data: {
          status: 'ERROR',
          errorCount: { increment: 1 },
          healthStatus: {
            status: 'error',
            error: 'OAuth token expired or authentication failed',
            lastCheck: new Date().toISOString(),
            autoMarkedAsError: true
          }
        }
      })

      console.log(`已标记账号 ${failedAccountId} 为错误状态`)

      // 2. 重新选择可用账号（排除刚失败的账号）
      const accounts = await this.getAvailableAccounts(userId, accountType, false)
      const availableAccounts = accounts.filter(acc => acc.id !== failedAccountId)
      
      if (availableAccounts.length === 0) {
        console.log('没有其他可用账号')
        return null
      }

      // 3. 从可用账号中选择最优的
      const healthyAccounts = this.filterHealthyAccounts(availableAccounts, 0.5)
      if (healthyAccounts.length > 0) {
        const selectedAccount = this.selectByWeightedRoundRobin(healthyAccounts)
        console.log(`故障转移到账号 ${selectedAccount?.id}`)
        return selectedAccount
      }

      // 4. 如果没有健康账号，返回第一个可用账号
      console.log(`使用第一个可用账号 ${availableAccounts[0]?.id}`)
      return availableAccounts[0] || null

    } catch (error) {
      console.error('故障转移失败:', error)
      return null
    }
  }

  /**
   * 更新账号使用统计
   */
  async updateAccountUsage(
    accountId: bigint, 
    success: boolean, 
    responseTime?: number
  ): Promise<void> {
    try {
      const updateData: any = {
        lastUsedAt: new Date(),
        requestCount: { increment: 1 }
      }

      if (success) {
        updateData.successCount = { increment: 1 }
      } else {
        updateData.errorCount = { increment: 1 }
      }

      await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: updateData
      })

      // 如果有响应时间，更新健康状态
      if (responseTime !== undefined) {
        await this.updateHealthStatus(accountId, success, responseTime)
      }

    } catch (error) {
      console.error('更新账号使用统计失败:', error)
    }
  }

  /**
   * 更新健康状态
   */
  private async updateHealthStatus(
    accountId: bigint, 
    success: boolean, 
    responseTime: number
  ): Promise<void> {
    try {
      const healthStatus = {
        status: success ? 'success' : 'error',
        responseTime: success ? responseTime : undefined,
        lastCheck: new Date().toISOString(),
        error: success ? undefined : 'Request failed'
      }

      await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: {
          status: success ? 'ACTIVE' : 'ERROR',
          lastHealthCheck: new Date(),
          healthStatus: JSON.parse(JSON.stringify(healthStatus))
        }
      })

    } catch (error) {
      console.error('更新健康状态失败:', error)
    }
  }

  /**
   * 获取账号统计信息
   */
  async getAccountStats(userId: bigint): Promise<{
    total: number
    active: number
    error: number
    byType: Record<string, number>
  }> {
    const accounts = await prisma.upstreamAccount.findMany({
      where: { userId },
      select: { type: true, status: true }
    })

    const stats = {
      total: accounts.length,
      active: accounts.filter(a => a.status === 'ACTIVE').length,
      error: accounts.filter(a => a.status === 'ERROR').length,
      byType: {} as Record<string, number>
    }

    // 按类型统计
    for (const account of accounts) {
      stats.byType[account.type] = (stats.byType[account.type] || 0) + 1
    }

    return stats
  }

  /**
   * 清理资源（已使用统一prisma实例，无需手动断开）
   */
  async disconnect(): Promise<void> {
    // 不需要手动断开连接，使用统一的prisma实例
  }
}

// 创建单例实例
export const loadBalancer = new LoadBalancer()