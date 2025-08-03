/**
 * 数据库查询优化器
 * 提供查询缓存、批量操作和性能监控
 */

import { prisma } from '@/lib/prisma'
import { userCache, apiKeyCache, accountCache, credentialCache, CacheKeys } from '@/lib/cache/cacheManager'
import { secureLog } from '@/lib/utils/secure-logger'
import { toBigInt, toStringId } from '@/lib/utils/id-converter'
import type { User, ApiKey, UpstreamAccount, UsageRecord } from '@prisma/client'

export interface QueryOptions {
  useCache?: boolean
  cacheTtl?: number
  timeout?: number
}

export interface BatchOperation<T> {
  operation: 'create' | 'update' | 'delete'
  data: T
  where?: any
}

export class QueryOptimizer {
  /**
   * 缓存增强的用户查询
   */
  static async findUser(
    userId: string | number | bigint,
    options: QueryOptions = {}
  ): Promise<User | null> {
    const { useCache = true, cacheTtl = 300 } = options
    const id = toBigInt(userId)
    const cacheKey = CacheKeys.user(id)

    // 尝试从缓存获取
    if (useCache) {
      const cached = await userCache.get<User>(cacheKey)
      if (cached) return cached
    }

    const startTime = Date.now()
    
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          apiKeys: {
            select: {
              id: true,
              name: true,
              permissions: true,
              isActive: true,
              lastUsedAt: true
            }
          }
        }
      })

      const queryTime = Date.now() - startTime

      // 性能日志
      if (queryTime > 100) {
        secureLog.warn('慢查询检测', {
          operation: 'findUser',
          userId: id.toString(),
          queryTime,
          threshold: 100
        })
      }

      // 缓存结果
      if (user && useCache) {
        await userCache.set(cacheKey, user, cacheTtl)
      }

      return user
    } catch (error) {
      secureLog.error('用户查询失败', error as Error, {
        userId: id.toString(),
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 缓存增强的API Key查询
   */
  static async findApiKey(
    keyId: string | number | bigint,
    options: QueryOptions = {}
  ): Promise<ApiKey | null> {
    const { useCache = true, cacheTtl = 600 } = options
    const id = toBigInt(keyId)
    const cacheKey = CacheKeys.apiKey(id)

    if (useCache) {
      const cached = await apiKeyCache.get<ApiKey>(cacheKey)
      if (cached) return cached
    }

    const startTime = Date.now()

    try {
      const apiKey = await prisma.apiKey.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true
            }
          }
        }
      })

      const queryTime = Date.now() - startTime

      if (queryTime > 50) {
        secureLog.warn('慢查询检测', {
          operation: 'findApiKey',
          keyId: id.toString(),
          queryTime,
          threshold: 50
        })
      }

      if (apiKey && useCache) {
        await apiKeyCache.set(cacheKey, apiKey, cacheTtl)
      }

      return apiKey
    } catch (error) {
      secureLog.error('API Key查询失败', error as Error, {
        keyId: id.toString(),
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 缓存增强的上游账号查询
   */
  static async findUpstreamAccount(
    accountId: string | number | bigint,
    options: QueryOptions = {}
  ): Promise<UpstreamAccount | null> {
    const { useCache = true, cacheTtl = 180 } = options
    const id = toBigInt(accountId)
    const cacheKey = CacheKeys.upstreamAccount(id)

    if (useCache) {
      const cached = await accountCache.get<UpstreamAccount>(cacheKey)
      if (cached) return cached
    }

    const startTime = Date.now()

    try {
      const account = await prisma.upstreamAccount.findUnique({
        where: { id }
      })

      const queryTime = Date.now() - startTime

      if (queryTime > 75) {
        secureLog.warn('慢查询检测', {
          operation: 'findUpstreamAccount',
          accountId: id.toString(),
          queryTime,
          threshold: 75
        })
      }

      if (account && useCache) {
        await accountCache.set(cacheKey, account, cacheTtl)
      }

      return account
    } catch (error) {
      secureLog.error('上游账号查询失败', error as Error, {
        accountId: id.toString(),
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 批量查询用户的上游账号
   */
  static async findUserUpstreamAccounts(
    userId: string | number | bigint,
    accountTypes?: string[],
    options: QueryOptions = {}
  ): Promise<UpstreamAccount[]> {
    const { useCache = true, cacheTtl = 180 } = options
    const id = toBigInt(userId)
    const cacheKey = CacheKeys.userAccounts(id)

    if (useCache) {
      const cached = await accountCache.get<UpstreamAccount[]>(cacheKey)
      if (cached) {
        return accountTypes ? 
          cached.filter(acc => accountTypes.includes(acc.type)) : 
          cached
      }
    }

    const startTime = Date.now()

    try {
      const accounts = await prisma.upstreamAccount.findMany({
        where: {
          userId: id,
          status: 'ACTIVE' as any,
          ...(accountTypes && { type: { in: accountTypes as any } })
        },
        orderBy: [
          { successCount: 'desc' },
          { requestCount: 'asc' },
          { lastUsedAt: 'desc' }
        ]
      })

      const queryTime = Date.now() - startTime

      if (queryTime > 150) {
        secureLog.warn('慢查询检测', {
          operation: 'findUserUpstreamAccounts',
          userId: id.toString(),
          accountCount: accounts.length,
          queryTime,
          threshold: 150
        })
      }

      if (useCache) {
        await accountCache.set(cacheKey, accounts, cacheTtl)
      }

      return accounts
    } catch (error) {
      secureLog.error('用户上游账号查询失败', error as Error, {
        userId: id.toString(),
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 批量创建使用记录（优化版）
   */
  static async createUsageRecordsBatch(records: Omit<UsageRecord, 'id' | 'createdAt'>[]): Promise<void> {
    if (records.length === 0) return

    const startTime = Date.now()
    const batchSize = 100

    try {
      // 分批插入以避免内存问题
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize)
        
        await prisma.usageRecord.createMany({
          data: batch.map(record => ({
            ...record,
            createdAt: new Date()
          })),
          skipDuplicates: true
        })
      }

      const queryTime = Date.now() - startTime

      secureLog.info('批量创建使用记录完成', {
        recordCount: records.length,
        batchCount: Math.ceil(records.length / batchSize),
        queryTime
      })

    } catch (error) {
      secureLog.error('批量创建使用记录失败', error as Error, {
        recordCount: records.length,
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 使用统计聚合查询（优化版）
   */
  static async getUsageStatistics(
    userId: string | number | bigint,
    startDate: Date,
    endDate: Date,
    options: QueryOptions = {}
  ): Promise<any> {
    const { useCache = true, cacheTtl = 300 } = options
    const id = toBigInt(userId)
    const period = `${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`
    const cacheKey = CacheKeys.usageStats(id, period)

    if (useCache) {
      const cached = await userCache.get(cacheKey)
      if (cached) return cached
    }

    const startTime = Date.now()

    try {
      // 使用原生SQL进行高效聚合查询
      const result = await prisma.$queryRaw`
        SELECT 
          COUNT(*) as total_requests,
          SUM("inputTokens") as total_input_tokens,
          SUM("outputTokens") as total_output_tokens,
          SUM("cost") as total_cost,
          AVG("responseTime") as avg_response_time,
          COUNT(CASE WHEN "statusCode" >= 200 AND "statusCode" < 300 THEN 1 END) as success_count,
          COUNT(CASE WHEN "statusCode" >= 400 THEN 1 END) as error_count,
          COUNT(DISTINCT "model") as unique_models,
          MIN("createdAt") as first_request,
          MAX("createdAt") as last_request
        FROM "UsageRecord" ur
        INNER JOIN "ApiKey" ak ON ur."apiKeyId" = ak.id
        WHERE ak."userId" = ${id}
          AND ur."createdAt" >= ${startDate}
          AND ur."createdAt" <= ${endDate}
      `

      const queryTime = Date.now() - startTime

      if (queryTime > 200) {
        secureLog.warn('慢查询检测', {
          operation: 'getUsageStatistics',
          userId: id.toString(),
          period,
          queryTime,
          threshold: 200
        })
      }

      const stats = Array.isArray(result) ? result[0] : result

      if (useCache) {
        await userCache.set(cacheKey, stats, cacheTtl)
      }

      return stats
    } catch (error) {
      secureLog.error('使用统计查询失败', error as Error, {
        userId: id.toString(),
        period,
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 账号性能统计更新（批量优化）
   */
  static async updateAccountStatsBatch(
    updates: Array<{
      accountId: bigint
      success: boolean
      responseTime: number
    }>
  ): Promise<void> {
    if (updates.length === 0) return

    const startTime = Date.now()

    try {
      // 按账号分组计算统计数据
      const accountStats = new Map<string, {
        totalRequests: number
        successCount: number
        totalResponseTime: number
      }>()

      for (const update of updates) {
        const key = update.accountId.toString()
        const stats = accountStats.get(key) || {
          totalRequests: 0,
          successCount: 0,
          totalResponseTime: 0
        }

        stats.totalRequests += 1
        if (update.success) stats.successCount += 1
        stats.totalResponseTime += update.responseTime

        accountStats.set(key, stats)
      }

      // 批量更新账号统计
      const updatePromises = Array.from(accountStats.entries()).map(([accountId, stats]) => {
        return prisma.upstreamAccount.update({
          where: { id: toBigInt(accountId) },
          data: {
            requestCount: { increment: stats.totalRequests },
            successCount: { increment: stats.successCount },
            lastUsedAt: new Date(),
            ...(stats.successCount === 0 && { errorCount: { increment: stats.totalRequests } })
          }
        })
      })

      await Promise.all(updatePromises)

      // 清理相关缓存
      const accountIds = Array.from(accountStats.keys())
      for (const accountId of accountIds) {
        await accountCache.delete(CacheKeys.upstreamAccount(accountId))
        await accountCache.delete(CacheKeys.accountStats(accountId))
      }

      const queryTime = Date.now() - startTime

      secureLog.info('批量更新账号统计完成', {
        updateCount: updates.length,
        accountCount: accountStats.size,
        queryTime
      })

    } catch (error) {
      secureLog.error('批量更新账号统计失败', error as Error, {
        updateCount: updates.length,
        queryTime: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 缓存失效管理
   */
  static async invalidateUserCache(userId: string | number | bigint): Promise<void> {
    const id = toBigInt(userId)
    await Promise.all([
      userCache.delete(CacheKeys.user(id)),
      userCache.delete(CacheKeys.userApiKeys(id)),
      accountCache.delete(CacheKeys.userAccounts(id))
    ])
  }

  static async invalidateApiKeyCache(keyId: string | number | bigint): Promise<void> {
    const id = toBigInt(keyId)
    await apiKeyCache.delete(CacheKeys.apiKey(id))
  }

  static async invalidateAccountCache(accountId: string | number | bigint): Promise<void> {
    const id = toBigInt(accountId)
    await Promise.all([
      accountCache.delete(CacheKeys.upstreamAccount(id)),
      accountCache.delete(CacheKeys.accountStats(id)),
      credentialCache.delete(CacheKeys.accountCredentials(id))
    ])
  }

  /**
   * 获取缓存性能统计
   */
  static getCacheStats() {
    return {
      user: userCache.getStats(),
      apiKey: apiKeyCache.getStats(),
      account: accountCache.getStats(),
      credential: credentialCache.getStats()
    }
  }

  /**
   * 数据库连接池监控
   */
  static async getDatabaseStats() {
    try {
      // 获取数据库连接信息
      const connectionInfo = await prisma.$queryRaw`
        SELECT 
          count(*) as active_connections,
          max(setting::int) as max_connections
        FROM pg_stat_activity 
        CROSS JOIN pg_settings 
        WHERE pg_settings.name = 'max_connections'
      `

      return Array.isArray(connectionInfo) ? connectionInfo[0] : connectionInfo
    } catch (error) {
      secureLog.error('获取数据库统计失败', error as Error)
      return null
    }
  }
}