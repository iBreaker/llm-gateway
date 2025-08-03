import { prisma } from '@/lib/prisma'

// 缓存接口
interface AccountCache {
  accounts: any[]
  timestamp: number
  userId: bigint
  accountType: string
}

// 健康分数计算接口
interface HealthScore {
  score: number           // 0-1之间的健康分数
  latency: number        // 平均延迟(ms)
  successRate: number    // 成功率
  lastCheck: Date        // 最后检查时间
  factors: {             // 分数影响因素
    availability: number // 可用性分数
    performance: number  // 性能分数
    reliability: number  // 可靠性分数
  }
}

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
  strategy?: 'weighted_round_robin' | 'priority_first' | 'least_connections' | 'adaptive'
  includeInactive?: boolean
  minHealthScore?: number
  useCache?: boolean
  cacheTimeout?: number // 缓存超时时间(ms)
  enableHealthScoring?: boolean
}

/**
 * 负载均衡器 - 选择最优的上游账号
 */
export class LoadBalancer {
  private accountCache = new Map<string, AccountCache>()
  private healthScores = new Map<string, HealthScore>()
  
  constructor() {
    // 使用统一的prisma实例
    
    // 定期清理过期缓存
    setInterval(() => {
      this.cleanupExpiredCache()
    }, 5 * 60 * 1000) // 每5分钟清理一次
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
      minHealthScore = 0.5,
      useCache = true,
      cacheTimeout = 60000, // 1分钟
      enableHealthScoring = true
    } = options

    // 获取可用的上游账号（支持缓存）
    const accounts = await this.getAvailableAccounts(userId, accountType, includeInactive, useCache, cacheTimeout)
    
    if (accounts.length === 0) {
      return null
    }

    // 计算健康分数（如果启用）
    if (enableHealthScoring) {
      await this.updateHealthScores(accounts)
    }

    // 过滤健康的账号
    const healthyAccounts = enableHealthScoring 
      ? this.filterAccountsByHealthScore(accounts, minHealthScore)
      : this.filterHealthyAccounts(accounts, minHealthScore)
    
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
      case 'adaptive':
        return this.selectByAdaptive(healthyAccounts)
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
    includeInactive: boolean,
    useCache: boolean = true,
    cacheTimeout: number = 60000
  ): Promise<any[]> {
    // 缓存键
    const cacheKey = `${userId}_${accountType}_${includeInactive}`
    
    // 检查缓存
    if (useCache) {
      const cached = this.accountCache.get(cacheKey)
      if (cached && (Date.now() - cached.timestamp) < cacheTimeout) {
        return cached.accounts
      }
    }

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

    // 更新缓存
    if (useCache) {
      this.accountCache.set(cacheKey, {
        accounts,
        timestamp: Date.now(),
        userId,
        accountType
      })
    }

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
   * 基于健康分数过滤账号
   */
  private filterAccountsByHealthScore(accounts: any[], minHealthScore: number): any[] {
    return accounts.filter(account => {
      const scoreKey = account.id.toString()
      const healthScore = this.healthScores.get(scoreKey)
      
      // 如果没有健康分数，使用基础过滤
      if (!healthScore) {
        return account.status !== 'ERROR'
      }
      
      return healthScore.score >= minHealthScore
    })
  }

  /**
   * 更新健康分数
   */
  private async updateHealthScores(accounts: any[]): Promise<void> {
    for (const account of accounts) {
      const scoreKey = account.id.toString()
      const healthScore = this.calculateHealthScore(account)
      this.healthScores.set(scoreKey, healthScore)
    }
  }

  /**
   * 计算账号健康分数
   */
  private calculateHealthScore(account: any): HealthScore {
    const now = Date.now()
    const requestCount = Number(account.requestCount) || 0
    const successCount = Number(account.successCount) || 0
    const errorCount = Number(account.errorCount) || 0
    
    // 基础指标
    const successRate = requestCount > 0 ? successCount / requestCount : 1.0
    const errorRate = requestCount > 0 ? errorCount / requestCount : 0.0
    
    // 可用性分数 (基于成功率)
    let availability = successRate
    if (account.status === 'ERROR') {
      availability *= 0.1 // 错误状态大幅降低可用性
    } else if (account.status === 'INACTIVE') {
      availability *= 0.5 // 非活跃状态适度降低
    }
    
    // 性能分数 (基于响应时间)
    let performance = 1.0
    if (account.healthStatus && account.healthStatus.responseTime) {
      const responseTime = account.healthStatus.responseTime
      // 响应时间超过2秒开始影响性能分数
      if (responseTime > 2000) {
        performance = Math.max(0.1, 1.0 - (responseTime - 2000) / 10000)
      } else if (responseTime > 1000) {
        performance = 1.0 - (responseTime - 1000) / 5000
      }
    }
    
    // 可靠性分数 (基于最近错误率和时间衰减)
    let reliability = 1.0 - errorRate
    
    // 时间衰减因子 - 最近的健康检查更重要
    const lastCheckTime = account.lastHealthCheck?.getTime() || 0
    const timeSinceCheck = now - lastCheckTime
    const timeDecay = Math.exp(-timeSinceCheck / (10 * 60 * 1000)) // 10分钟半衰期
    
    // 综合健康分数
    const score = (
      availability * 0.4 +    // 可用性权重40%
      performance * 0.3 +     // 性能权重30%
      reliability * 0.3       // 可靠性权重30%
    ) * timeDecay
    
    return {
      score: Math.max(0, Math.min(1, score)),
      latency: account.healthStatus?.responseTime || 0,
      successRate,
      lastCheck: account.lastHealthCheck || new Date(0),
      factors: {
        availability,
        performance,
        reliability
      }
    }
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    const now = Date.now()
    const maxAge = 10 * 60 * 1000 // 10分钟

    // 清理账号缓存
    const accountCacheKeys = Array.from(this.accountCache.keys())
    for (const key of accountCacheKeys) {
      const cache = this.accountCache.get(key)
      if (cache && now - cache.timestamp > maxAge) {
        this.accountCache.delete(key)
      }
    }

    // 清理健康分数缓存
    const healthScoreKeys = Array.from(this.healthScores.keys())
    for (const key of healthScoreKeys) {
      const score = this.healthScores.get(key)
      if (score && now - score.lastCheck.getTime() > maxAge) {
        this.healthScores.delete(key)
      }
    }
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
   * 自适应负载均衡策略
   * 基于健康分数、响应时间和成功率动态选择最优账号
   */
  private selectByAdaptive(accounts: any[]): any {
    if (accounts.length === 0) {
      return null
    }

    if (accounts.length === 1) {
      return accounts[0]
    }

    // 计算每个账号的自适应分数
    const scoredAccounts = accounts.map(account => {
      const scoreKey = account.id.toString()
      const healthScore = this.healthScores.get(scoreKey)
      
      let adaptiveScore = 0
      
      if (healthScore) {
        // 基于健康分数
        adaptiveScore += healthScore.score * 0.4
        
        // 基于响应时间（越低越好）
        const latencyScore = healthScore.latency > 0 
          ? Math.max(0, 1 - healthScore.latency / 5000) // 5秒为最差情况
          : 1
        adaptiveScore += latencyScore * 0.3
        
        // 基于成功率
        adaptiveScore += healthScore.successRate * 0.3
      } else {
        // 没有健康分数时的备选计算
        const requestCount = Number(account.requestCount) || 0
        const successCount = Number(account.successCount) || 0
        const successRate = requestCount > 0 ? successCount / requestCount : 1.0
        
        adaptiveScore = successRate * 0.7 + (account.status === 'ACTIVE' ? 0.3 : 0)
      }
      
      // 考虑账号权重
      adaptiveScore *= (account.weight / 100) // 标准化权重

      return {
        account,
        score: adaptiveScore
      }
    })

    // 按分数排序，选择最高分的账号
    scoredAccounts.sort((a, b) => b.score - a.score)
    
    // 在前3名中随机选择，避免总是选择同一个账号
    const topCandidates = scoredAccounts.slice(0, Math.min(3, scoredAccounts.length))
    const weights = topCandidates.map((candidate, index) => {
      // 第一名权重最高，后续递减
      return Math.pow(0.7, index)
    })
    
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
    let random = Math.random() * totalWeight
    
    for (let i = 0; i < topCandidates.length; i++) {
      random -= weights[i]
      if (random <= 0) {
        return topCandidates[i].account
      }
    }
    
    // 备选：返回最高分的账号
    return scoredAccounts[0].account
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
   * 获取负载均衡器性能指标
   */
  getLoadBalancerMetrics(): {
    cacheHitRate: number
    cacheSize: number
    healthScoresCacheSize: number
    avgHealthScore: number
    topAccounts: Array<{
      id: string
      score: number
      factors: {
        availability: number
        performance: number
        reliability: number
      }
    }>
  } {
    // 计算缓存命中率（这需要实际的统计）
    const cacheSize = this.accountCache.size
    const healthScoresCacheSize = this.healthScores.size
    
    // 计算平均健康分数
    const healthScores = Array.from(this.healthScores.values())
    const avgHealthScore = healthScores.length > 0 
      ? healthScores.reduce((sum, score) => sum + score.score, 0) / healthScores.length
      : 0

    // 获取前5名健康账号
    const topAccounts = Array.from(this.healthScores.entries())
      .map(([id, score]) => ({
        id,
        score: score.score,
        factors: score.factors
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    return {
      cacheHitRate: 0, // 需要实际统计
      cacheSize,
      healthScoresCacheSize,
      avgHealthScore,
      topAccounts
    }
  }

  /**
   * 获取特定账号的详细健康信息
   */
  getAccountHealthDetails(accountId: bigint): HealthScore | null {
    const scoreKey = accountId.toString()
    return this.healthScores.get(scoreKey) || null
  }

  /**
   * 强制刷新指定用户的账号缓存
   */
  invalidateUserCache(userId: bigint): void {
    const keysToDelete: string[] = []
    const cacheKeys = Array.from(this.accountCache.keys())
    
    for (const key of cacheKeys) {
      const cache = this.accountCache.get(key)
      if (cache && cache.userId === userId) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => this.accountCache.delete(key))
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    accountCache: {
      size: number
      keys: string[]
      oldestEntry: number
      newestEntry: number
    }
    healthScoresCache: {
      size: number
      avgScore: number
      oldestCheck: number
      newestCheck: number
    }
  } {
    const accountCacheEntries = Array.from(this.accountCache.entries())
    const healthScoreEntries = Array.from(this.healthScores.entries())
    
    return {
      accountCache: {
        size: this.accountCache.size,
        keys: accountCacheEntries.map(([key]) => key),
        oldestEntry: accountCacheEntries.length > 0 
          ? Math.min(...accountCacheEntries.map(([, cache]) => cache.timestamp))
          : 0,
        newestEntry: accountCacheEntries.length > 0
          ? Math.max(...accountCacheEntries.map(([, cache]) => cache.timestamp))
          : 0
      },
      healthScoresCache: {
        size: this.healthScores.size,
        avgScore: healthScoreEntries.length > 0
          ? healthScoreEntries.reduce((sum, [, score]) => sum + score.score, 0) / healthScoreEntries.length
          : 0,
        oldestCheck: healthScoreEntries.length > 0
          ? Math.min(...healthScoreEntries.map(([, score]) => score.lastCheck.getTime()))
          : 0,
        newestCheck: healthScoreEntries.length > 0
          ? Math.max(...healthScoreEntries.map(([, score]) => score.lastCheck.getTime()))
          : 0
      }
    }
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