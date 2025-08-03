import { prisma } from '@/lib/prisma';
import { ServiceError, PaginatedResponse, PaginationParams, SortParams } from './index';

// 使用统计相关类型定义
export interface UsageRecordData {
  apiKeyId: bigint;
  upstreamAccountId?: bigint | null;
  requestId: string;
  method: string;
  endpoint: string;
  model?: string;
  statusCode?: number;
  responseTime?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  tokensUsed?: number;
  cost?: number;
  errorMessage?: string;
  userAgent?: string;
  clientIp?: string;
}

export interface UsageStats {
  totalApiKeys: number;
  activeAccounts: number;
  totalRequests: number;
  errorRate: number;
  totalCost: number;
  avgResponseTime: number;
}

export interface DetailedStats {
  requestsByHour: Array<{ hour: string; count: number }>;
  requestsByModel: Array<{ model: string; count: number; tokens: number; cost: number }>;
  requestsByDate: Array<{ date: string; count: number; tokens: number; cost: number }>; // 添加前端期望的字段
  topEndpoints: Array<{ endpoint: string; count: number }>;
  errorsByType: Array<{ errorType: string; count: number }>;
  costBreakdown: Array<{ period: string; cost: number }>;
  tokenUsage: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheTokens: number;
  };
  // 为前端兼容性添加的字段
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  totalCost: number;
  // Token统计
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  averageTokensPerRequest: number;
  // 账号效率
  accountStats: {
    id: string;
    name: string;
    type: string;
    requestCount: number;
    totalTokens: number;
    totalCost: number;
    averageTokensPerRequest: number;
    averageCostPerRequest: number;
  }[];
}

export interface UsageListParams extends PaginationParams, SortParams {
  apiKeyId?: bigint;
  upstreamAccountId?: bigint;
  model?: string;
  hasError?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 使用统计服务类
 * 处理所有使用统计相关的业务逻辑
 */
export class UsageService {

  /**
   * 记录使用统计
   */
  static async recordUsage(usageData: UsageRecordData): Promise<void> {
    try {
      // 计算总token数（向后兼容）
      const tokensUsed = (usageData.inputTokens || 0) + 
                        (usageData.outputTokens || 0) + 
                        (usageData.cacheCreationInputTokens || 0) + 
                        (usageData.cacheReadInputTokens || 0);

      await prisma.usageRecord.create({
        data: {
          apiKeyId: usageData.apiKeyId,
          upstreamAccountId: usageData.upstreamAccountId,
          requestId: usageData.requestId,
          method: usageData.method,
          endpoint: usageData.endpoint,
          model: usageData.model,
          statusCode: usageData.statusCode,
          responseTime: usageData.responseTime,
          inputTokens: BigInt(usageData.inputTokens || 0),
          outputTokens: BigInt(usageData.outputTokens || 0),
          cacheCreationInputTokens: BigInt(usageData.cacheCreationInputTokens || 0),
          cacheReadInputTokens: BigInt(usageData.cacheReadInputTokens || 0),
          tokensUsed: BigInt(tokensUsed),
          cost: usageData.cost || 0,
          errorMessage: usageData.errorMessage,
          userAgent: usageData.userAgent,
          clientIp: usageData.clientIp
        }
      });
    } catch (error) {
      // 使用统计记录失败不应该影响主要业务流程
      console.error('记录使用统计失败:', error);
      throw new ServiceError('记录使用统计失败', 'RECORD_USAGE_FAILED', 500);
    }
  }

  /**
   * 获取基础统计信息
   */
  static async getBasicStats(): Promise<UsageStats> {
    try {
      const [
        totalApiKeys,
        activeAccounts,
        totalRequests,
        errorCount,
        costResult,
        avgResponseResult
      ] = await Promise.all([
        // API Keys 总数
        prisma.apiKey.count({
          where: { isActive: true }
        }),
        
        // 活跃上游账号数
        prisma.upstreamAccount.count({
          where: { status: 'ACTIVE' }
        }),
        
        // 总请求数
        prisma.usageRecord.count(),
        
        // 错误请求数
        prisma.usageRecord.count({
          where: {
            errorMessage: { not: null }
          }
        }),
        
        // 总成本
        prisma.usageRecord.aggregate({
          _sum: { cost: true }
        }),
        
        // 平均响应时间
        prisma.usageRecord.aggregate({
          _avg: { responseTime: true },
          where: {
            responseTime: { not: null }
          }
        })
      ]);

      const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
      const totalCost = Number(costResult._sum.cost || 0);
      const avgResponseTime = Math.round(avgResponseResult._avg.responseTime || 0);

      return {
        totalApiKeys,
        activeAccounts,
        totalRequests,
        errorRate,
        totalCost,
        avgResponseTime
      };
    } catch (error) {
      throw new ServiceError('获取基础统计失败', 'GET_BASIC_STATS_FAILED', 500);
    }
  }

  /**
   * 获取详细统计信息
   */
  static async getDetailedStats(userId?: bigint): Promise<DetailedStats> {
    try {
      const whereClause: any = {};
      
      // 如果指定用户，只统计该用户的数据
      if (userId) {
        whereClause.apiKey = { userId };
      }

      // 获取基础统计信息
      const [
        totalRequests,
        successfulRequests,
        failedRequests,
        avgResponseResult,
        totalCostResult
      ] = await Promise.all([
        prisma.usageRecord.count({ where: whereClause }),
        prisma.usageRecord.count({ 
          where: { ...whereClause, statusCode: { lt: 400 } } 
        }),
        prisma.usageRecord.count({ 
          where: { ...whereClause, statusCode: { gte: 400 } } 
        }),
        prisma.usageRecord.aggregate({
          where: { ...whereClause, responseTime: { not: null } },
          _avg: { responseTime: true }
        }),
        prisma.usageRecord.aggregate({
          where: whereClause,
          _sum: { cost: true }
        })
      ]);

      // 获取过去24小时的请求分布
      const past24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const requestsByHour = await prisma.usageRecord.groupBy({
        by: ['createdAt'],
        where: {
          ...whereClause,
          createdAt: { gte: past24Hours }
        },
        _count: { requestId: true }
      });

      // 获取过去7天的请求分布（用于 requestsByDate）
      const past7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const requestsByDate = await prisma.usageRecord.groupBy({
        by: ['createdAt'],
        where: {
          ...whereClause,
          createdAt: { gte: past7Days }
        },
        _count: { requestId: true },
        _sum: {
          tokensUsed: true,
          cost: true
        }
      });

      // 按小时聚合数据
      const hourlyStats = this.aggregateByHour(requestsByHour);
      
      // 按日期聚合数据
      const dailyStats = this.aggregateByDay(requestsByDate);

      // 按模型统计请求数、Token和成本
      const requestsByModel = await prisma.usageRecord.groupBy({
        by: ['model'],
        where: {
          ...whereClause,
          model: { not: null }
        },
        _count: { requestId: true },
        _sum: { 
          tokensUsed: true,
          cost: true
        },
        orderBy: { _count: { requestId: 'desc' } },
        take: 10
      });

      // 热门端点统计
      const topEndpoints = await prisma.usageRecord.groupBy({
        by: ['endpoint'],
        where: whereClause,
        _count: { requestId: true },
        orderBy: { _count: { requestId: 'desc' } },
        take: 10
      });

      // 错误类型统计
      const errorsByType = await prisma.usageRecord.groupBy({
        by: ['statusCode'],
        where: {
          ...whereClause,
          statusCode: { gte: 400 }
        },
        _count: { requestId: true },
        orderBy: { _count: { requestId: 'desc' } }
      });

      // 成本分解（过去7天）
      const costBreakdown = await prisma.usageRecord.groupBy({
        by: ['createdAt'],
        where: {
          ...whereClause,
          createdAt: { gte: past7Days }
        },
        _sum: { cost: true }
      });

      // Token使用统计
      const tokenUsage = await prisma.usageRecord.aggregate({
        where: whereClause,
        _sum: {
          inputTokens: true,
          outputTokens: true,
          cacheCreationInputTokens: true,
          cacheReadInputTokens: true,
          tokensUsed: true
        }
      });

      // 按账号统计效率 (账号效率分析)
      const accountStatsRaw = await prisma.usageRecord.groupBy({
        by: ['upstreamAccountId'],
        where: {
          ...whereClause,
          upstreamAccountId: { not: null }
        },
        _count: { requestId: true },
        _sum: {
          tokensUsed: true,
          cost: true
        }
      });

      // 获取账号信息
      const accountIds = accountStatsRaw.map(stat => stat.upstreamAccountId!);
      const accounts = await prisma.upstreamAccount.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, name: true, type: true }
      });

      const accountStats = accountStatsRaw.map(stat => {
        const account = accounts.find(acc => acc.id === stat.upstreamAccountId);
        const requestCount = stat._count.requestId;
        const totalTokens = Number(stat._sum.tokensUsed || 0);
        const totalCost = Number(stat._sum.cost || 0);
        
        return {
          id: stat.upstreamAccountId!.toString(),
          name: account?.name || 'Unknown',
          type: account?.type || 'Unknown',
          requestCount,
          totalTokens,
          totalCost,
          averageTokensPerRequest: requestCount > 0 ? totalTokens / requestCount : 0,
          averageCostPerRequest: requestCount > 0 ? totalCost / requestCount : 0
        };
      }).sort((a, b) => b.totalTokens - a.totalTokens);

      // 计算总Token统计
      const totalInputTokens = Number(tokenUsage._sum.inputTokens || 0);
      const totalOutputTokens = Number(tokenUsage._sum.outputTokens || 0);
      const totalCacheCreationTokens = Number(tokenUsage._sum.cacheCreationInputTokens || 0);
      const totalCacheReadTokens = Number(tokenUsage._sum.cacheReadInputTokens || 0);
      const totalTokens = Number(tokenUsage._sum.tokensUsed || 0);
      const averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;

      return {
        // 前端兼容性字段
        totalRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime: Math.round(avgResponseResult._avg.responseTime || 0),
        totalCost: Number(totalCostResult._sum.cost || 0),
        
        // Token统计
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreationTokens,
        totalCacheReadTokens,
        averageTokensPerRequest,
        
        // 账号效率
        accountStats,
        
        // 详细统计数据
        requestsByHour: hourlyStats,
        requestsByDate: this.aggregateByDayWithTokens(requestsByDate), // 前端期望的字段
        requestsByModel: requestsByModel.map(item => ({
          model: item.model || 'unknown',
          count: item._count.requestId,
          tokens: Number(item._sum.tokensUsed || 0),
          cost: Number(item._sum.cost || 0)
        })),
        topEndpoints: topEndpoints.map(item => ({
          endpoint: item.endpoint,
          count: item._count.requestId
        })),
        errorsByType: errorsByType.map(item => ({
          errorType: this.getErrorTypeName(item.statusCode || 0),
          count: item._count.requestId
        })),
        costBreakdown: this.aggregateCostByDay(costBreakdown),
        tokenUsage: {
          totalInputTokens,
          totalOutputTokens,
          totalCacheTokens: totalCacheCreationTokens + totalCacheReadTokens
        }
      };
    } catch (error) {
      throw new ServiceError('获取详细统计失败', 'GET_DETAILED_STATS_FAILED', 500);
    }
  }

  /**
   * 获取使用记录列表
   */
  static async getUsageRecords(params: UsageListParams = {}): Promise<PaginatedResponse<any>> {
    const {
      page = 1,
      pageSize = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      apiKeyId,
      upstreamAccountId,
      model,
      hasError,
      startDate,
      endDate
    } = params;

    // 构建查询条件
    const where: any = {};
    
    if (apiKeyId) {
      where.apiKeyId = apiKeyId;
    }
    
    if (upstreamAccountId) {
      where.upstreamAccountId = upstreamAccountId;
    }
    
    if (model) {
      where.model = model;
    }
    
    if (hasError !== undefined) {
      if (hasError) {
        where.errorMessage = { not: null };
      } else {
        where.errorMessage = null;
      }
    }
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // 构建排序条件
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    try {
      const [records, total] = await Promise.all([
        prisma.usageRecord.findMany({
          where,
          include: {
            apiKey: {
              select: { name: true }
            },
            upstreamAccount: {
              select: { name: true, type: true }
            }
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        prisma.usageRecord.count({ where })
      ]);

      const formattedRecords = records.map(record => ({
        id: record.id.toString(),
        requestId: record.requestId,
        method: record.method,
        endpoint: record.endpoint,
        model: record.model,
        statusCode: record.statusCode,
        responseTime: record.responseTime,
        inputTokens: Number(record.inputTokens),
        outputTokens: Number(record.outputTokens),
        cacheCreationInputTokens: Number(record.cacheCreationInputTokens),
        cacheReadInputTokens: Number(record.cacheReadInputTokens),
        cost: Number(record.cost),
        errorMessage: record.errorMessage,
        apiKeyName: record.apiKey.name,
        upstreamAccountName: record.upstreamAccount?.name,
        upstreamAccountType: record.upstreamAccount?.type,
        createdAt: record.createdAt.toISOString()
      }));

      return {
        data: formattedRecords,
        total,
        page,
        pageSize,
        hasNext: page * pageSize < total
      };
    } catch (error) {
      throw new ServiceError('获取使用记录失败', 'GET_USAGE_RECORDS_FAILED', 500);
    }
  }

  /**
   * 获取用户的使用统计
   */
  static async getUserStats(userId: bigint): Promise<any> {
    try {
      const userApiKeys = await prisma.apiKey.findMany({
        where: { userId },
        select: { id: true }
      });

      const apiKeyIds = userApiKeys.map(key => key.id);

      if (apiKeyIds.length === 0) {
        return {
          totalRequests: 0,
          totalCost: 0,
          totalTokens: 0,
          errorRate: 0
        };
      }

      const [totalRequests, errorCount, costResult, tokenResult] = await Promise.all([
        prisma.usageRecord.count({
          where: { apiKeyId: { in: apiKeyIds } }
        }),
        
        prisma.usageRecord.count({
          where: {
            apiKeyId: { in: apiKeyIds },
            errorMessage: { not: null }
          }
        }),
        
        prisma.usageRecord.aggregate({
          where: { apiKeyId: { in: apiKeyIds } },
          _sum: { cost: true }
        }),
        
        prisma.usageRecord.aggregate({
          where: { apiKeyId: { in: apiKeyIds } },
          _sum: { tokensUsed: true }
        })
      ]);

      const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

      return {
        totalRequests,
        totalCost: Number(costResult._sum.cost || 0),
        totalTokens: Number(tokenResult._sum.tokensUsed || 0),
        errorRate
      };
    } catch (error) {
      throw new ServiceError('获取用户统计失败', 'GET_USER_STATS_FAILED', 500);
    }
  }

  /**
   * 按小时聚合数据
   */
  private static aggregateByHour(records: any[]): Array<{ hour: string; count: number }> {
    const hourlyData: Record<string, number> = {};
    
    // 初始化过去24小时的数据
    for (let i = 23; i >= 0; i--) {
      const hour = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourKey = hour.toISOString().slice(0, 13) + ':00';
      hourlyData[hourKey] = 0;
    }

    // 聚合实际数据
    records.forEach(record => {
      const hour = new Date(record.createdAt).toISOString().slice(0, 13) + ':00';
      hourlyData[hour] = (hourlyData[hour] || 0) + record._count.requestId;
    });

    return Object.entries(hourlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count }));
  }

  /**
   * 按日期聚合数据
   */
  private static aggregateByDay(records: any[]): Array<{ date: string; count: number }> {
    const dailyData: Record<string, number> = {};
    
    // 初始化过去7天的数据
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayKey = day.toISOString().slice(0, 10);
      dailyData[dayKey] = 0;
    }

    // 聚合实际数据
    records.forEach(record => {
      const day = new Date(record.createdAt).toISOString().slice(0, 10);
      dailyData[day] = (dailyData[day] || 0) + record._count.requestId;
    });

    return Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }

  /**
   * 按日期聚合数据，包含Token和成本信息
   */
  private static aggregateByDayWithTokens(records: any[]): Array<{ date: string; count: number; tokens: number; cost: number }> {
    const dailyData: Record<string, { count: number; tokens: number; cost: number }> = {};
    
    // 初始化过去7天的数据
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayKey = day.toISOString().slice(0, 10);
      dailyData[dayKey] = { count: 0, tokens: 0, cost: 0 };
    }

    // 聚合实际数据
    records.forEach(record => {
      const day = new Date(record.createdAt).toISOString().slice(0, 10);
      if (!dailyData[day]) {
        dailyData[day] = { count: 0, tokens: 0, cost: 0 };
      }
      dailyData[day].count += record._count.requestId;
      dailyData[day].tokens += Number(record._sum.tokensUsed || 0);
      dailyData[day].cost += Number(record._sum.cost || 0);
    });

    return Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ 
        date, 
        count: data.count, 
        tokens: data.tokens, 
        cost: data.cost 
      }));
  }

  /**
   * 按天聚合成本数据
   */
  private static aggregateCostByDay(records: any[]): Array<{ period: string; cost: number }> {
    const dailyData: Record<string, number> = {};
    
    records.forEach(record => {
      const day = new Date(record.createdAt).toISOString().slice(0, 10);
      dailyData[day] = (dailyData[day] || 0) + Number(record._sum.cost || 0);
    });

    return Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, cost]) => ({ period, cost }));
  }

  /**
   * 获取错误类型名称
   */
  private static getErrorTypeName(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) {
      return '客户端错误';
    } else if (statusCode >= 500) {
      return '服务器错误';
    }
    return '未知错误';
  }

  /**
   * 清理历史数据（保留指定天数的数据）
   */
  static async cleanupOldRecords(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      
      const result = await prisma.usageRecord.deleteMany({
        where: {
          createdAt: { lt: cutoffDate }
        }
      });

      return result.count;
    } catch (error) {
      throw new ServiceError('清理历史数据失败', 'CLEANUP_RECORDS_FAILED', 500);
    }
  }
}