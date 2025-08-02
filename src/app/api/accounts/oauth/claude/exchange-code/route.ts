import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { parseCallbackUrl, exchangeCodeForTokens, formatClaudeCredentials } from '@/lib/oauth/claude-oauth'
import { prisma } from '@/lib/prisma'

// 强制动态渲染
export const dynamic = 'force-dynamic'

/**
 * 交换授权码获取 Claude Code 访问令牌
 */
async function handleExchangeCode(request: AuthenticatedRequest) {
  try {
    const body = await request.json()
    const { sessionId, authorizationCode, callbackUrl, name, description } = body

    // 验证必需参数
    if (!sessionId || (!authorizationCode && !callbackUrl)) {
      return NextResponse.json(
        { error: 'invalid_request', message: '缺少必需参数：sessionId 和 authorizationCode 或 callbackUrl' },
        { status: 400 }
      )
    }

    // 获取 OAuth 会话
    const session = await prisma.oAuthSession.findUnique({
      where: { id: sessionId }
    })

    if (!session) {
      return NextResponse.json(
        { error: 'invalid_session', message: '无效的会话ID或会话已过期' },
        { status: 400 }
      )
    }

    // 检查会话是否过期
    if (new Date() > session.expiresAt) {
      // 删除过期会话
      await prisma.oAuthSession.delete({ where: { id: sessionId } })
      return NextResponse.json(
        { error: 'session_expired', message: '会话已过期，请重新生成授权链接' },
        { status: 400 }
      )
    }

    // 解析授权码
    const finalAuthCode = callbackUrl ? parseCallbackUrl(callbackUrl) : authorizationCode

    // 交换访问令牌
    const tokenData = await exchangeCodeForTokens(
      finalAuthCode,
      session.codeVerifier,
      session.state
    )

    // 格式化凭据
    const credentials = formatClaudeCredentials(tokenData)

    // 创建上游账号
    const upstreamAccount = await prisma.upstreamAccount.create({
      data: {
        userId: request.user.id,
        name: name || 'Claude Code Account',
        type: 'CLAUDE_CODE',
        credentials: credentials,
        config: {},
        status: 'ACTIVE',
        priority: 1,
        weight: 100
      }
    })

    // 清理 OAuth 会话
    await prisma.oAuthSession.delete({ where: { id: sessionId } })

    return NextResponse.json({
      success: true,
      message: 'Claude Code 账号添加成功',
      data: {
        id: upstreamAccount.id.toString(),
        name: upstreamAccount.name,
        type: upstreamAccount.type,
        status: upstreamAccount.status,
        scopes: tokenData.scopes,
        createdAt: upstreamAccount.createdAt
      }
    })

  } catch (error) {
    console.error('Exchange code failed:', error)
    return NextResponse.json(
      { 
        error: 'oauth_error', 
        message: error instanceof Error ? error.message : '令牌交换失败' 
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const POST = withAuth(handleExchangeCode)