import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { ApiKeyService, ServiceError } from '@/lib/services'

async function handleGetApiKeys(request: AuthenticatedRequest) {
  try {
    // 从查询参数中获取分页和过滤选项
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const isActive = searchParams.get('isActive')
    const hasExpired = searchParams.get('hasExpired')
    const search = searchParams.get('search')

    const result = await ApiKeyService.getApiKeysByUser(request.user.id, {
      page,
      pageSize,
      isActive: isActive === null ? undefined : isActive === 'true',
      hasExpired: hasExpired === null ? undefined : hasExpired === 'true',
      search: search || undefined
    })

    return NextResponse.json({
      apiKeys: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasNext: result.hasNext
      }
    })

  } catch (error) {
    console.error('获取API Keys失败:', error)
    
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

async function handleCreateApiKey(request: AuthenticatedRequest) {
  try {
    const keyData = await request.json()
    const result = await ApiKeyService.createApiKey(request.user.id, keyData)

    return NextResponse.json(result, { status: 201 })

  } catch (error) {
    console.error('创建API Key失败:', error)
    
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

export const GET = withAuth(handleGetApiKeys)
export const POST = withAuth(handleCreateApiKey)