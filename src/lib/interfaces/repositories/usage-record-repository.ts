import type { BaseRepository } from './base'
import type { DatabaseUsageRecord } from '../database'

/**
 * 使用记录数据创建接口
 */
export interface CreateUsageRecordData {
  apiKeyId: number
  upstreamAccountId?: number | null
  requestId: string
  method: string
  endpoint: string
  statusCode?: number | null
  responseTime?: number | null
  tokensUsed?: number
  cost?: number
  errorMessage?: string | null
}

/**
 * 使用统计接口
 */
export interface UsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalTokens: number
  totalCost: number
  averageResponseTime: number
  successRate: number
}

/**
 * 使用记录 Repository 接口
 * 定义使用记录相关的业务数据访问方法
 */
export interface UsageRecordRepository extends BaseRepository<DatabaseUsageRecord, CreateUsageRecordData, never> {
  /**
   * 根据 API 密钥 ID 查找使用记录
   */
  findByApiKeyId(apiKeyId: number, limit?: number, offset?: number): Promise<DatabaseUsageRecord[]>

  /**
   * 根据上游账号 ID 查找使用记录
   */
  findByUpstreamAccountId(upstreamAccountId: number, limit?: number, offset?: number): Promise<DatabaseUsageRecord[]>

  /**
   * 获取 API 密钥的使用统计
   */
  getUsageStats(apiKeyId: number, startDate?: Date, endDate?: Date): Promise<UsageStats>

  /**
   * 获取上游账号的使用统计
   */
  getUpstreamAccountStats(upstreamAccountId: number, startDate?: Date, endDate?: Date): Promise<UsageStats>

  /**
   * 根据时间范围查找记录
   */
  findByDateRange(startDate: Date, endDate: Date, limit?: number, offset?: number): Promise<DatabaseUsageRecord[]>

  /**
   * 查找错误记录
   */
  findErrors(limit?: number, offset?: number): Promise<DatabaseUsageRecord[]>

  /**
   * 查找高成本请求
   */
  findHighCostRequests(minCost: number, limit?: number, offset?: number): Promise<DatabaseUsageRecord[]>

  /**
   * 删除旧记录（数据清理）
   */
  deleteOldRecords(olderThanDays: number): Promise<number>
}