import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 这里应该从数据库获取真实数据，暂时返回模拟数据
    // TODO: 实现真实的数据库查询
    const stats = {
      totalRequests: 12543,
      activeAccounts: 8,
      apiKeysCount: 15,
      successRate: 99.2,
      avgResponseTime: 245,
      totalCost: 287.56
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('获取统计数据失败:', error)
    
    return NextResponse.json({
      error: '获取统计数据失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}