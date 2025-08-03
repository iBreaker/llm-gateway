/**
 * 性能监控器
 * 收集和分析系统性能指标，提供实时监控和告警
 */

import { secureLog } from '@/lib/utils/secure-logger'
import { QueryOptimizer } from '@/lib/db/queryOptimizer'

export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: number
  tags?: Record<string, string>
  threshold?: {
    warning: number
    critical: number
  }
}

export interface RequestMetrics {
  requestId: string
  endpoint: string
  method: string
  startTime: number
  endTime?: number
  duration?: number
  statusCode?: number
  userAgent?: string
  clientIP?: string
  apiKeyId?: string
  upstreamAccountId?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  cost?: number
  error?: string
}

export interface SystemMetrics {
  timestamp: number
  cpu: {
    usage: number
    loadAverage: number[]
  }
  memory: {
    used: number
    total: number
    heapUsed: number
    heapTotal: number
  }
  database: {
    activeConnections: number
    maxConnections: number
    queryLatency: number
  }
  cache: {
    hitRate: number
    size: number
    evictions: number
  }
  api: {
    requestsPerMinute: number
    averageResponseTime: number
    errorRate: number
  }
}

export class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private requestMetrics: Map<string, RequestMetrics> = new Map()
  private systemMetricsHistory: SystemMetrics[] = []
  private readonly maxHistorySize = 1000
  private readonly cleanupInterval: NodeJS.Timeout

  constructor() {
    // 每分钟清理过期的请求指标
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMetrics()
    }, 60 * 1000)

    // 每5秒收集系统指标
    setInterval(() => {
      this.collectSystemMetrics()
    }, 5 * 1000)
  }

  /**
   * 开始请求监控
   */
  startRequest(
    requestId: string,
    endpoint: string,
    method: string,
    options: {
      userAgent?: string
      clientIP?: string
      apiKeyId?: string
    } = {}
  ): void {
    const metric: RequestMetrics = {
      requestId,
      endpoint,
      method,
      startTime: Date.now(),
      ...options
    }

    this.requestMetrics.set(requestId, metric)
  }

  /**
   * 结束请求监控
   */
  endRequest(
    requestId: string,
    statusCode: number,
    options: {
      upstreamAccountId?: string
      model?: string
      inputTokens?: number
      outputTokens?: number
      cost?: number
      error?: string
    } = {}
  ): RequestMetrics | null {
    const metric = this.requestMetrics.get(requestId)
    if (!metric) return null

    const endTime = Date.now()
    const duration = endTime - metric.startTime

    // 更新指标
    metric.endTime = endTime
    metric.duration = duration
    metric.statusCode = statusCode
    Object.assign(metric, options)

    // 记录性能指标
    this.recordMetric('request_duration', duration, 'ms', {
      endpoint: metric.endpoint,
      method: metric.method,
      status: statusCode.toString()
    }, {
      warning: 1000,
      critical: 5000
    })

    // 记录请求量
    this.recordMetric('request_count', 1, 'count', {
      endpoint: metric.endpoint,
      method: metric.method,
      status: statusCode.toString()
    })

    // 如果是API请求，记录token和成本指标
    if (options.inputTokens !== undefined) {
      this.recordMetric('input_tokens', options.inputTokens, 'tokens', {
        endpoint: metric.endpoint,
        model: options.model || 'unknown'
      })
    }

    if (options.outputTokens !== undefined) {
      this.recordMetric('output_tokens', options.outputTokens, 'tokens', {
        endpoint: metric.endpoint,
        model: options.model || 'unknown'
      })
    }

    if (options.cost !== undefined) {
      this.recordMetric('api_cost', options.cost, 'usd', {
        endpoint: metric.endpoint,
        model: options.model || 'unknown'
      })
    }

    // 检查性能告警
    this.checkPerformanceAlerts(metric)

    // 结构化日志记录
    secureLog.info('请求完成', {
      requestId,
      endpoint: metric.endpoint,
      method: metric.method,
      statusCode,
      duration,
      model: options.model,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      cost: options.cost
    })

    // 从内存中移除（避免内存泄露）
    this.requestMetrics.delete(requestId)

    return metric
  }

  /**
   * 记录自定义指标
   */
  recordMetric(
    name: string,
    value: number,
    unit: string,
    tags: Record<string, string> = {},
    threshold?: { warning: number; critical: number }
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
      threshold
    }

    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const metricList = this.metrics.get(name)!
    metricList.push(metric)

    // 保持指标历史记录在合理范围内
    if (metricList.length > this.maxHistorySize) {
      metricList.splice(0, metricList.length - this.maxHistorySize)
    }

    // 检查阈值告警
    if (threshold) {
      if (value >= threshold.critical) {
        secureLog.error('性能指标达到临界值', undefined, {
          metric: name,
          value,
          unit,
          threshold: threshold.critical,
          tags
        })
      } else if (value >= threshold.warning) {
        secureLog.warn('性能指标达到警告值', {
          metric: name,
          value,
          unit,
          threshold: threshold.warning,
          tags
        })
      }
    }
  }

  /**
   * 获取指标统计
   */
  getMetricStats(
    name: string,
    timeWindow: number = 5 * 60 * 1000 // 默认5分钟
  ): {
    count: number
    avg: number
    min: number
    max: number
    p95: number
    p99: number
  } | null {
    const metricList = this.metrics.get(name)
    if (!metricList) return null

    const cutoff = Date.now() - timeWindow
    const recentMetrics = metricList
      .filter(m => m.timestamp >= cutoff)
      .map(m => m.value)
      .sort((a, b) => a - b)

    if (recentMetrics.length === 0) return null

    const count = recentMetrics.length
    const sum = recentMetrics.reduce((acc, val) => acc + val, 0)
    const avg = sum / count
    const min = recentMetrics[0]
    const max = recentMetrics[count - 1]
    
    const p95Index = Math.floor(count * 0.95)
    const p99Index = Math.floor(count * 0.99)
    const p95 = recentMetrics[p95Index] || max
    const p99 = recentMetrics[p99Index] || max

    return { count, avg, min, max, p95, p99 }
  }

  /**
   * 收集系统指标
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const timestamp = Date.now()

      // 内存使用情况
      const memUsage = process.memoryUsage()

      // 数据库统计
      const dbStats = await QueryOptimizer.getDatabaseStats()

      // 缓存统计
      const cacheStats = QueryOptimizer.getCacheStats()

      // API统计（最近5分钟）
      const apiStats = this.calculateApiStats()

      const systemMetric: SystemMetrics = {
        timestamp,
        cpu: {
          usage: 0, // Node.js 没有直接的CPU使用率API
          loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0]
        },
        memory: {
          used: memUsage.rss,
          total: require('os').totalmem(),
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal
        },
        database: {
          activeConnections: dbStats?.active_connections || 0,
          maxConnections: dbStats?.max_connections || 0,
          queryLatency: this.getMetricStats('query_duration')?.avg || 0
        },
        cache: {
          hitRate: Object.values(cacheStats).reduce((acc, stat) => acc + stat.hitRate, 0) / Object.keys(cacheStats).length,
          size: Object.values(cacheStats).reduce((acc, stat) => acc + stat.size, 0),
          evictions: 0 // 需要在缓存管理器中实现
        },
        api: apiStats
      }

      this.systemMetricsHistory.push(systemMetric)

      // 保持历史记录在合理范围内
      if (this.systemMetricsHistory.length > this.maxHistorySize) {
        this.systemMetricsHistory.splice(0, this.systemMetricsHistory.length - this.maxHistorySize)
      }

      // 记录关键系统指标
      this.recordMetric('memory_usage', systemMetric.memory.used / systemMetric.memory.total * 100, 'percent')
      this.recordMetric('heap_usage', systemMetric.memory.heapUsed / systemMetric.memory.heapTotal * 100, 'percent')
      this.recordMetric('db_connections', systemMetric.database.activeConnections, 'count')
      this.recordMetric('cache_hit_rate', systemMetric.cache.hitRate, 'percent')

    } catch (error) {
      secureLog.error('收集系统指标失败', error as Error)
    }
  }

  /**
   * 计算API统计
   */
  private calculateApiStats(): {
    requestsPerMinute: number
    averageResponseTime: number
    errorRate: number
  } {
    const now = Date.now()
    const oneMinute = 60 * 1000

    const requestStats = this.getMetricStats('request_count', oneMinute)
    const durationStats = this.getMetricStats('request_duration', oneMinute)

    // 计算错误率
    const errorMetrics = this.metrics.get('request_count')?.filter(m => 
      m.timestamp >= now - oneMinute && 
      m.tags?.status && 
      parseInt(m.tags.status) >= 400
    ) || []

    const totalRequests = requestStats?.count || 0
    const errorCount = errorMetrics.length
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0

    return {
      requestsPerMinute: requestStats?.count || 0,
      averageResponseTime: durationStats?.avg || 0,
      errorRate
    }
  }

  /**
   * 检查性能告警
   */
  private checkPerformanceAlerts(metric: RequestMetrics): void {
    const { duration = 0, statusCode = 0, endpoint, error } = metric

    // 慢请求告警
    if (duration > 5000) {
      secureLog.warn('慢请求检测', {
        requestId: metric.requestId,
        endpoint,
        duration,
        threshold: 5000
      })
    }

    // 错误率告警
    if (statusCode >= 500) {
      secureLog.error('服务器错误', undefined, {
        requestId: metric.requestId,
        endpoint,
        statusCode,
        error
      })
    }

    // 上游服务错误
    if (statusCode >= 400 && statusCode < 500 && metric.upstreamAccountId) {
      secureLog.warn('上游服务错误', {
        requestId: metric.requestId,
        endpoint,
        statusCode,
        upstreamAccountId: metric.upstreamAccountId
      })
    }
  }

  /**
   * 清理过期指标
   */
  private cleanupExpiredMetrics(): void {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000) // 24小时前

    for (const [name, metricList] of this.metrics.entries()) {
      const filteredMetrics = metricList.filter(m => m.timestamp >= cutoff)
      
      if (filteredMetrics.length !== metricList.length) {
        this.metrics.set(name, filteredMetrics)
      }
    }

    // 清理过期的请求指标（超过1小时未完成的请求）
    const requestCutoff = Date.now() - (60 * 60 * 1000)
    for (const [requestId, metric] of this.requestMetrics.entries()) {
      if (metric.startTime < requestCutoff) {
        this.requestMetrics.delete(requestId)
      }
    }
  }

  /**
   * 获取系统健康状态
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical'
    checks: Array<{
      name: string
      status: 'ok' | 'warning' | 'error'
      message: string
      value?: number
      threshold?: number
    }>
  } {
    const checks: Array<{
      name: string
      status: 'ok' | 'warning' | 'error'
      message: string
      value?: number
      threshold?: number
    }> = []

    // 内存使用检查
    const memoryStats = this.getMetricStats('memory_usage')
    if (memoryStats) {
      const memoryUsage = memoryStats.avg
      if (memoryUsage > 90) {
        checks.push({
          name: 'memory',
          status: 'error',
          message: '内存使用率过高',
          value: memoryUsage,
          threshold: 90
        })
      } else if (memoryUsage > 80) {
        checks.push({
          name: 'memory',
          status: 'warning',
          message: '内存使用率较高',
          value: memoryUsage,
          threshold: 80
        })
      } else {
        checks.push({
          name: 'memory',
          status: 'ok',
          message: '内存使用正常',
          value: memoryUsage
        })
      }
    }

    // 响应时间检查
    const responseTimeStats = this.getMetricStats('request_duration')
    if (responseTimeStats) {
      const avgResponseTime = responseTimeStats.avg
      if (avgResponseTime > 5000) {
        checks.push({
          name: 'response_time',
          status: 'error',
          message: '平均响应时间过长',
          value: avgResponseTime,
          threshold: 5000
        })
      } else if (avgResponseTime > 2000) {
        checks.push({
          name: 'response_time',
          status: 'warning',
          message: '平均响应时间较长',
          value: avgResponseTime,
          threshold: 2000
        })
      } else {
        checks.push({
          name: 'response_time',
          status: 'ok',
          message: '响应时间正常',
          value: avgResponseTime
        })
      }
    }

    // 错误率检查
    const apiStats = this.calculateApiStats()
    if (apiStats.errorRate > 10) {
      checks.push({
        name: 'error_rate',
        status: 'error',
        message: '错误率过高',
        value: apiStats.errorRate,
        threshold: 10
      })
    } else if (apiStats.errorRate > 5) {
      checks.push({
        name: 'error_rate',
        status: 'warning',
        message: '错误率较高',
        value: apiStats.errorRate,
        threshold: 5
      })
    } else {
      checks.push({
        name: 'error_rate',
        status: 'ok',
        message: '错误率正常',
        value: apiStats.errorRate
      })
    }

    // 确定整体状态
    const hasError = checks.some(c => c.status === 'error')
    const hasWarning = checks.some(c => c.status === 'warning')

    const status = hasError ? 'critical' : hasWarning ? 'warning' : 'healthy'

    return { status, checks }
  }

  /**
   * 导出指标数据（用于外部监控系统）
   */
  exportMetrics(): {
    timestamp: number
    metrics: PerformanceMetric[]
    systemMetrics: SystemMetrics[]
    summary: Record<string, any>
  } {
    const allMetrics: PerformanceMetric[] = []
    for (const metricList of this.metrics.values()) {
      allMetrics.push(...metricList)
    }

    const summary = {
      totalRequests: this.getMetricStats('request_count')?.count || 0,
      averageResponseTime: this.getMetricStats('request_duration')?.avg || 0,
      errorRate: this.calculateApiStats().errorRate,
      memoryUsage: this.getMetricStats('memory_usage')?.avg || 0,
      cacheHitRate: this.getMetricStats('cache_hit_rate')?.avg || 0
    }

    return {
      timestamp: Date.now(),
      metrics: allMetrics,
      systemMetrics: this.systemMetricsHistory,
      summary
    }
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    clearInterval(this.cleanupInterval)
    this.metrics.clear()
    this.requestMetrics.clear()
    this.systemMetricsHistory.length = 0
  }
}

// 全局性能监控实例
export const performanceMonitor = new PerformanceMonitor()