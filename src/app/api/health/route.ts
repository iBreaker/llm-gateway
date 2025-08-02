import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { healthChecker } from '@/lib/health-checker'

async function handleGetHealthStats(request: AuthenticatedRequest) {
  try {
    const stats = await healthChecker.getHealthStats()
    
    return NextResponse.json({
      stats,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('获取健康统计失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

async function handleTriggerHealthCheck(request: AuthenticatedRequest) {
  try {
    // 触发手动健康检查
    const results = await healthChecker.checkAllAccounts()
    
    return NextResponse.json({
      message: '健康检查已完成',
      results: results.map(result => ({
        accountId: result.accountId.toString(),
        success: result.success,
        responseTime: result.responseTime,
        error: result.error,
        timestamp: result.timestamp.toISOString()
      }))
    })

  } catch (error) {
    console.error('执行健康检查失败:', error)
    return NextResponse.json(
      { message: '健康检查失败' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetHealthStats, { requiredRoles: ['ADMIN'] })
export const POST = withAuth(handleTriggerHealthCheck, { requiredRoles: ['ADMIN'] })