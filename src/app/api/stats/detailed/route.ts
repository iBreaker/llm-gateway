import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

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

    // 计算平均响应时间（模拟数据）
    const averageResponseTime = 150 + Math.floor(Math.random() * 100)

    // 计算总费用（模拟数据）
    const totalCost = totalRequests * 0.002

    // 按模型分布（模拟数据）
    const requestsByModel = [
      { model: 'claude-3-sonnet', count: Math.floor(totalRequests * 0.4) },
      { model: 'claude-3-haiku', count: Math.floor(totalRequests * 0.3) },
      { model: 'gemini-pro', count: Math.floor(totalRequests * 0.2) },
      { model: 'gpt-4', count: Math.floor(totalRequests * 0.1) }
    ].filter(item => item.count > 0)

    // 按日期分布（模拟数据）
    const requestsByDate = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const count = Math.floor(Math.random() * (totalRequests / days * 2))
      requestsByDate.push({
        date: date.toISOString().split('T')[0],
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
  } finally {
    await prisma.$disconnect()
  }
}

export const GET = withAuth(handleGetDetailedStats)