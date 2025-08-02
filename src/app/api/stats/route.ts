import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

    // 获取总请求数 (示例数据，实际应从使用记录计算)
    const totalRequests = await prisma.usageRecord.count()

    // 计算错误率 (示例计算)
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
  } finally {
    await prisma.$disconnect()
  }
}

export const GET = withAuth(handleGetStats)