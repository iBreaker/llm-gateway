import { NextRequest, NextResponse } from 'next/server'
import { generateClaudeAuthUrl, generateGeminiAuthUrl, type OAuthProvider } from '@/lib/utils/oauth-helpers'

// POST /api/oauth/initiate
export async function POST(request: NextRequest) {
  try {
    const { provider }: { provider: OAuthProvider } = await request.json()

    if (!['claude', 'gemini'].includes(provider)) {
      return NextResponse.json(
        { error: '不支持的 OAuth 提供商' },
        { status: 400 }
      )
    }

    // 构建重定向 URI（指向我们的回调处理器）
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : `http://localhost:${process.env.PORT || 3000}`
    
    const redirectUri = `${baseUrl}/api/oauth/callback`

    let authData: any

    if (provider === 'claude') {
      authData = generateClaudeAuthUrl(redirectUri)
    } else if (provider === 'gemini') {
      authData = generateGeminiAuthUrl(redirectUri)
    }

    // 在实际应用中，应该将 state、codeVerifier 等存储在 session 或数据库中
    // 这里为了简单起见，返回给前端让前端暂存
    return NextResponse.json({
      success: true,
      authUrl: authData.authUrl,
      provider,
      state: authData.state,
      ...(provider === 'claude' && { codeVerifier: authData.codeVerifier })
    })
  } catch (error) {
    console.error('OAuth 授权初始化失败:', error)
    
    return NextResponse.json({
      error: 'OAuth 授权初始化失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}