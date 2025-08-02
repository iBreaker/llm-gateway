import { NextRequest, NextResponse } from 'next/server'
import { accountManager } from '@/lib/services/account-manager'
import type { CreateAccountInput, AccountType } from '@/lib/types/account-types'
import { withAuth, logUserActivity } from '@/lib/utils/auth-helpers'

// POST /api/dashboard/accounts/create
export const POST = withAuth(async (request: NextRequest, { userId }) => {
  const startTime = Date.now()
  console.log('🔄 开始创建账号...', { userId, timestamp: new Date().toISOString() })
  
  try {
    const body = await request.json()
    console.log('📝 收到创建账号请求:', { type: body.type, email: body.email })

    // 验证账号类型
    const validTypes: AccountType[] = ['gemini_oauth', 'claude_oauth', 'llm_gateway']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: '无效的账号类型' },
        { status: 400 }
      )
    }

    // 验证必填字段
    let validationError: string | null = null

    switch (body.type) {
      case 'gemini_oauth':
      case 'claude_oauth':
        if (!body.credentials?.access_token) {
          validationError = 'OAuth 账号需要 Access Token'
        }
        if (!body.credentials?.refresh_token) {
          validationError = validationError 
            ? validationError + '，同时强烈建议提供 Refresh Token' 
            : '强烈建议提供 Refresh Token 以支持自动令牌刷新'
        }
        break
      case 'llm_gateway':
        if (!body.base_url || !body.credentials?.api_key) {
          validationError = 'LLM Gateway 账号需要 Base URL 和 API Key'
        }
        break
    }

    if (validationError) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      )
    }

    // 根据账号类型构建创建输入数��
    let createInput: CreateAccountInput

    switch (body.type) {
      case 'gemini_oauth':
      case 'claude_oauth':
        createInput = {
          type: body.type,
          email: body.email,
          credentials: body.credentials,
          priority: body.priority || 1,
          weight: body.weight || 100,
          user_id: userId  // 添加用户ID关联
        }
        break
      case 'llm_gateway':
        createInput = {
          type: body.type,
          base_url: body.base_url,
          credentials: body.credentials,
          priority: body.priority || 1,
          weight: body.weight || 100,
          user_id: userId  // 添加用户ID关联
        }
        break
      default:
        return NextResponse.json(
          { error: '不支持的账号类型' },
          { status: 400 }
        )
    }

    // 使用统一账号管理器创建账号（添加超时保护）
    console.log('💾 开始数据库操作...', { elapsed: Date.now() - startTime, timestamp: new Date().toISOString() })
    
    const createPromise = accountManager.createAccount(createInput)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('创建账号超时（25秒）')), 25000)
    })
    
    const newAccount = await Promise.race([createPromise, timeoutPromise]) as any
    console.log('✅ 账号创建成功:', { 
      accountId: newAccount.id, 
      elapsed: Date.now() - startTime,
      timestamp: new Date().toISOString()
    })

    // 记录用户活动
    await logUserActivity(
      userId,
      'create_upstream_account',
      'upstream_account',
      newAccount.id.toString(),
      { account_type: body.type, email: body.email },
      request
    )

    return NextResponse.json({
      success: true,
      account: newAccount
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`❌ 创建账号失败 (耗时: ${elapsed}ms):`, {
      error: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined,
      elapsed,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json({
      error: '创建账号失败',
      message: error instanceof Error ? error.message : '未知错误',
      elapsed: `${elapsed}ms`
    }, {
      status: 500
    })
  }
})