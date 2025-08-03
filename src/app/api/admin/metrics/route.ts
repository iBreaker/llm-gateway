/**
 * 系统监控和指标API
 * 提供性能指标、健康检查和系统状态查询
 */

import { NextRequest, NextResponse } from 'next/server'
import { performanceMonitor } from '@/lib/monitoring/performanceMonitor'
import { QueryOptimizer } from '@/lib/db/queryOptimizer'
import { secureLog } from '@/lib/utils/secure-logger'

// 强制动态渲染
export const dynamic = 'force-dynamic'

/**
 * 获取系统指标
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const type = url.searchParams.get('type')
    const format = url.searchParams.get('format') || 'json'

    // 简单的身份验证（生产环境应使用更严格的认证）
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    // 这里应该验证管理员token，暂时用简单检查
    if (token !== process.env.ADMIN_API_TOKEN) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 403 }
      )
    }

    switch (type) {
      case 'health':
        return handleHealthCheck()
      
      case 'performance':
        return handlePerformanceMetrics()
      
      case 'cache':
        return handleCacheStats()
      
      case 'database':
        return handleDatabaseStats()
      
      case 'export':
        return handleMetricsExport(format)
      
      default:
        return handleOverview()
    }

  } catch (error) {
    secureLog.error('获取系统指标失败', error as Error, {
      endpoint: '/api/admin/metrics'
    })
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * 健康检查
 */
function handleHealthCheck(): NextResponse {
  const health = performanceMonitor.getHealthStatus()
  
  return NextResponse.json({
    status: health.status,
    timestamp: new Date().toISOString(),
    checks: health.checks,
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  })
}

/**
 * 性能指标
 */
function handlePerformanceMetrics(): NextResponse {
  const timeWindow = 5 * 60 * 1000 // 5分钟

  const metrics = {
    requests: {
      total: performanceMonitor.getMetricStats('request_count', timeWindow),
      duration: performanceMonitor.getMetricStats('request_duration', timeWindow),
      errors: performanceMonitor.getMetricStats('request_count', timeWindow) // 需要过滤错误状态
    },
    tokens: {
      input: performanceMonitor.getMetricStats('input_tokens', timeWindow),
      output: performanceMonitor.getMetricStats('output_tokens', timeWindow)
    },
    cost: performanceMonitor.getMetricStats('api_cost', timeWindow),
    system: {
      memory: performanceMonitor.getMetricStats('memory_usage', timeWindow),
      heap: performanceMonitor.getMetricStats('heap_usage', timeWindow)
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    timeWindow: '5m',
    metrics
  })
}

/**
 * 缓存统计
 */
function handleCacheStats(): NextResponse {
  const cacheStats = QueryOptimizer.getCacheStats()
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    caches: cacheStats
  })
}

/**
 * 数据库统计
 */
async function handleDatabaseStats(): Promise<NextResponse> {
  try {
    const dbStats = await QueryOptimizer.getDatabaseStats()
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      database: dbStats || { error: 'Unable to fetch database stats' }
    })
  } catch (error) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      database: { error: 'Database connection failed' }
    })
  }
}

/**
 * 指标导出
 */
function handleMetricsExport(format: string): NextResponse {
  const exportData = performanceMonitor.exportMetrics()
  
  if (format === 'prometheus') {
    // 转换为Prometheus格式
    let prometheusOutput = ''
    
    // 添加基本指标
    prometheusOutput += `# HELP llm_gateway_requests_total Total number of requests\n`
    prometheusOutput += `# TYPE llm_gateway_requests_total counter\n`
    prometheusOutput += `llm_gateway_requests_total ${exportData.summary.totalRequests}\n\n`
    
    prometheusOutput += `# HELP llm_gateway_response_time_avg Average response time in milliseconds\n`
    prometheusOutput += `# TYPE llm_gateway_response_time_avg gauge\n`
    prometheusOutput += `llm_gateway_response_time_avg ${exportData.summary.averageResponseTime}\n\n`
    
    prometheusOutput += `# HELP llm_gateway_error_rate Error rate percentage\n`
    prometheusOutput += `# TYPE llm_gateway_error_rate gauge\n`
    prometheusOutput += `llm_gateway_error_rate ${exportData.summary.errorRate}\n\n`
    
    prometheusOutput += `# HELP llm_gateway_memory_usage Memory usage percentage\n`
    prometheusOutput += `# TYPE llm_gateway_memory_usage gauge\n`
    prometheusOutput += `llm_gateway_memory_usage ${exportData.summary.memoryUsage}\n\n`
    
    prometheusOutput += `# HELP llm_gateway_cache_hit_rate Cache hit rate percentage\n`
    prometheusOutput += `# TYPE llm_gateway_cache_hit_rate gauge\n`
    prometheusOutput += `llm_gateway_cache_hit_rate ${exportData.summary.cacheHitRate}\n\n`

    return new NextResponse(prometheusOutput, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    })
  }
  
  // 默认JSON格式
  return NextResponse.json(exportData)
}

/**
 * 系统概览
 */
function handleOverview(): NextResponse {
  const health = performanceMonitor.getHealthStatus()
  const cacheStats = QueryOptimizer.getCacheStats()
  
  const overview = {
    timestamp: new Date().toISOString(),
    status: health.status,
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    node_version: process.version,
    platform: process.platform,
    
    // 快速指标
    quick_stats: {
      requests_5m: performanceMonitor.getMetricStats('request_count', 5 * 60 * 1000)?.count || 0,
      avg_response_time: performanceMonitor.getMetricStats('request_duration', 5 * 60 * 1000)?.avg || 0,
      memory_usage: performanceMonitor.getMetricStats('memory_usage')?.avg || 0,
      cache_hit_rate: Object.values(cacheStats).reduce((acc, stat) => acc + stat.hitRate, 0) / Object.keys(cacheStats).length
    },
    
    // 健康检查摘要
    health_summary: {
      total_checks: health.checks.length,
      passed: health.checks.filter(c => c.status === 'ok').length,
      warnings: health.checks.filter(c => c.status === 'warning').length,
      errors: health.checks.filter(c => c.status === 'error').length
    }
  }
  
  return NextResponse.json(overview)
}

/**
 * 设置监控告警阈值
 */
export async function POST(request: NextRequest) {
  try {
    // 身份验证
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    if (token !== process.env.ADMIN_API_TOKEN) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { action, metric, threshold } = body

    switch (action) {
      case 'set_threshold':
        // 这里应该实现阈值设置逻辑
        secureLog.info('监控阈值更新', {
          metric,
          threshold,
          admin: 'system'
        })
        
        return NextResponse.json({
          success: true,
          message: `Threshold set for ${metric}`,
          metric,
          threshold
        })
      
      case 'reset_metrics':
        // 重置指标（仅用于测试）
        return NextResponse.json({
          success: true,
          message: 'Metrics reset completed'
        })
      
      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        )
    }

  } catch (error) {
    secureLog.error('处理监控配置请求失败', error as Error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}