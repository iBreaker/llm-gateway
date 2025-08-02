import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function handleGetDetailedStats(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '7d'
    
    // 计算时间范围
    const now = new Date()
    const daysMap: Record<string, number> = {
      '1d': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90
    }
    const days = daysMap[range] || 7
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    // 获取基础统计
    const totalRequests = await prisma.usageRecord.count({
      where: {
        createdAt: {
          gte: startDate
        }
      }
    })

    const successfulRequests = await prisma.usageRecord.count({
      where: {
        createdAt: {
          gte: startDate
        },
        errorMessage: null
      }
    })

    const failedRequests = totalRequests - successfulRequests

    // 计算平均响应时间（从实际数据获取）
    const responseTimeResult = await prisma.usageRecord.aggregate({
      where: {
        createdAt: {
          gte: startDate
        },
        responseTime: {
          not: null
        }
      },
      _avg: {
        responseTime: true
      }
    })
    const averageResponseTime = Math.round(responseTimeResult._avg.responseTime || 0)

    // 计算总费用（从实际数据获取）
    const costResult = await prisma.usageRecord.aggregate({
      where: {
        createdAt: {
          gte: startDate
        }
      },
      _sum: {
        cost: true
      }
    })
    const totalCost = Number(costResult._sum.cost || 0)

    // 按模型分布（从实际数据获取）
    const modelStats = await prisma.usageRecord.groupBy({
      by: ['model'],
      where: {
        createdAt: {
          gte: startDate
        },
        model: {
          not: null
        }
      },
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    })

    const requestsByModel = modelStats.map(stat => ({
      model: stat.model || 'unknown',
      count: stat._count.id
    }))

    // 按日期分布（从实际数据获取）
    const dateStats = await prisma.$queryRaw<Array<{date: string, count: bigint}>>`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM usage_records 
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `

    // 创建完整的日期范围（包括没有请求的日期）
    const requestsByDate = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = date.toISOString().split('T')[0]
      
      // 查找该日期的实际数据
      const found = dateStats.find(stat => stat.date === dateStr)
      const count = found ? Number(found.count) : 0
      
      requestsByDate.push({
        date: dateStr,
        count
      })
    }

    return NextResponse.json({
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      totalCost,
      requestsByModel,
      requestsByDate
    })

  } catch (error) {
    console.error('获取详细统计数据失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetDetailedStats)