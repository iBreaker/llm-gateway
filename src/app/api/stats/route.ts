import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function handleGetStats(request: AuthenticatedRequest) {
  try {
    // 获取 API Keys 总数
    const totalApiKeys = await prisma.apiKey.count({
      where: { isActive: true }
    })

    // 获取活跃上游账号数
    const activeAccounts = await prisma.upstreamAccount.count({
      where: { status: 'ACTIVE' }
    })

    // 获取总请求数（从使用记录统计）
    const totalRequests = await prisma.usageRecord.count()

    // 计算错误率（从实际数据计算）
    const errorCount = await prisma.usageRecord.count({
      where: {
        errorMessage: { not: null }
      }
    })
    
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0

    return NextResponse.json({
      totalApiKeys,
      activeAccounts,
      totalRequests,
      errorRate
    })

  } catch (error) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetStats)