import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { generateOAuthParams } from '@/lib/oauth/anthropic-oauth'
import { prisma } from '@/lib/prisma'

// 强制动态渲染
export const dynamic = 'force-dynamic'

/**
 * 生成 Anthropic OAuth 授权 URL
 */
async function handleGenerateAuthUrl(request: AuthenticatedRequest) {
  try {

    // 生成 OAuth 参数
    const oauthParams = generateOAuthParams()
    
    // 创建 OAuth 会话（10分钟过期）
    const session = await prisma.oAuthSession.create({
      data: {
        codeVerifier: oauthParams.codeVerifier,
        state: oauthParams.state,
        codeChallenge: oauthParams.codeChallenge,
        provider: 'ANTHROPIC_OAUTH',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10分钟过期
      }
    })
    
    return NextResponse.json({
      success: true,
      data: {
        authUrl: oauthParams.authUrl,
        sessionId: session.id,
        expiresAt: session.expiresAt,
        instructions: [
          '1. 复制上面的链接在浏览器中打开',
          '2. 登录您的 Anthropic 账户',
          '3. 同意应用权限',
          '4. 复制浏览器地址栏中的完整回调 URL',
          '5. 使用回调 URL 完成账号添加'
        ]
      }
    })

  } catch (error) {
    console.error('Generate OAuth URL failed:', error)
    return NextResponse.json(
      { 
        error: 'oauth_error', 
        message: error instanceof Error ? error.message : '生成授权链接失败' 
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const POST = withAuth(handleGenerateAuthUrl)