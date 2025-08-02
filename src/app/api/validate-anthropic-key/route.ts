import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { AnthropicClient } from '@/lib/anthropic/client'

async function handleValidateAnthropicKey(request: AuthenticatedRequest) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'API Key是必填项' },
        { status: 400 }
      )
    }


    // 创建Anthropic客户端并验证
    const client = new AnthropicClient(apiKey)
    const isValid = await client.validateApiKey()

    if (isValid) {
      return NextResponse.json({
        valid: true,
        message: 'API Key验证成功',
        availableModels: client.getAvailableModels()
      })
    } else {
      return NextResponse.json({
        valid: false,
        error: 'API Key无效或已过期'
      })
    }

  } catch (error: any) {
    console.error('验证Anthropic API Key失败:', error)
    
    return NextResponse.json({
      valid: false,
      error: error.message || '验证过程中发生错误'
    })
  }
}

export const POST = withAuth(handleValidateAnthropicKey, { requiredRoles: ['ADMIN'] })