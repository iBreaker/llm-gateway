import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { UsageService, ServiceError } from '@/lib/services'

async function handleGetStats(request: AuthenticatedRequest) {
  try {
    const stats = await UsageService.getBasicStats()
    return NextResponse.json(stats)

  } catch (error) {
    console.error('获取统计数据失败:', error)
    
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetStats)