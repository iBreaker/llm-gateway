import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { UsageService, ServiceError } from '@/lib/services'

async function handleGetDetailedStats(request: AuthenticatedRequest) {
  try {
    // 检查用户权限，普通用户只能看自己的统计
    const userId = request.user.role === 'ADMIN' ? undefined : request.user.id
    
    const detailedStats = await UsageService.getDetailedStats(userId)
    return NextResponse.json(detailedStats)

  } catch (error) {
    console.error('获取详细统计数据失败:', error)
    
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

export const GET = withAuth(handleGetDetailedStats)