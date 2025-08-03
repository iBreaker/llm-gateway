import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { ApiKeyService, ServiceError } from '@/lib/services'

async function handleGetApiKey(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const apiKeyId = BigInt(params.id)
    const apiKey = await ApiKeyService.getApiKeyById(apiKeyId, request.user.id)

    if (!apiKey) {
      return NextResponse.json(
        { message: 'API Key不存在或无权限访问' },
        { status: 404 }
      )
    }

    return NextResponse.json({ apiKey })

  } catch (error) {
    console.error('获取API Key失败:', error)
    
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

async function handleUpdateApiKey(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const apiKeyId = BigInt(params.id)
    const updateData = await request.json()

    const updatedApiKey = await ApiKeyService.updateApiKey(apiKeyId, request.user.id, updateData)

    return NextResponse.json({
      apiKey: updatedApiKey
    })

  } catch (error) {
    console.error('更新API Key失败:', error)
    
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

async function handleDeleteApiKey(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const apiKeyId = BigInt(params.id)

    await ApiKeyService.deleteApiKey(apiKeyId, request.user.id)

    return NextResponse.json({
      message: 'API Key删除成功'
    })

  } catch (error) {
    console.error('删除API Key失败:', error)
    
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

export const GET = withAuth(handleGetApiKey)
export const PUT = withAuth(handleUpdateApiKey)
export const DELETE = withAuth(handleDeleteApiKey)