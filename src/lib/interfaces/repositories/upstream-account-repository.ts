import type { BaseRepository } from './base'
import type { DatabaseUpstreamAccount } from '../database'

/**
 * 上游账号数据创建接口
 */
export interface CreateUpstreamAccountData {
  type: string
  email: string
  credentials: Record<string, any>
  isActive?: boolean
  priority?: number
  weight?: number
}

/**
 * 上游账号数据更新接口
 */
export interface UpdateUpstreamAccountData {
  email?: string
  credentials?: Record<string, any>
  isActive?: boolean
  priority?: number
  weight?: number
  lastUsedAt?: Date | null
  requestCount?: number
  successCount?: number
  errorCount?: number
}

/**
 * 上游账号 Repository 接口
 * 定义上游账号相关的业务数据访问方法
 */
export interface UpstreamAccountRepository extends BaseRepository<DatabaseUpstreamAccount, CreateUpstreamAccountData, UpdateUpstreamAccountData> {
  /**
   * 根据类型查找上游账号
   */
  findByType(type: string): Promise<DatabaseUpstreamAccount[]>

  /**
   * 查找活跃的上游账号
   */
  findActiveByType(type: string): Promise<DatabaseUpstreamAccount[]>

  /**
   * 根据权重和优先级获取最佳账号
   */
  findBestAccount(type: string): Promise<DatabaseUpstreamAccount | null>

  /**
   * 更新账号使用统计
   */
  updateUsageStats(id: number, success: boolean, responseTime?: number): Promise<void>

  /**
   * 禁用账号
   */
  disable(id: number): Promise<boolean>

  /**
   * 启用账号
   */
  enable(id: number): Promise<boolean>

  /**
   * 获取账号健康状态
   */
  getHealthStats(id: number): Promise<{
    successRate: number
    totalRequests: number
    averageResponseTime: number
  } | null>
}