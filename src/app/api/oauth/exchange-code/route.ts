import { NextRequest, NextResponse } from 'next/server'
import { exchangeClaudeToken, exchangeGeminiToken, getClaudeUserInfo, getGeminiUserInfo } from '@/lib/utils/oauth-helpers'

// POST /api/oauth/exchange-code
export async function POST(request: NextRequest) {
  try {
    const { provider, code, codeVerifier, state }: { 
      provider: 'claude' | 'gemini', 
      code: string, 
      codeVerifier?: string, 
      state?: string 
    } = await request.json()

    if (!['claude', 'gemini'].includes(provider)) {
      return NextResponse.json(
        { error: '不支持的 OAuth 提供商' },
        { status: 400 }
      )
    }

    if (!code) {
      return NextResponse.json(
        { error: '授权码是必需的' },
        { status: 400 }
      )
    }

    let tokenData: any
    let userInfo: any

    try {
      if (provider === 'claude') {
        // Claude 需要 PKCE 参数
        if (!codeVerifier || !state) {
          return NextResponse.json({
            error: 'Claude OAuth 需要 PKCE 参数',
            message: '缺少必需的 codeVerifier 或 state 参数',
            suggestion: 'regenerate_url'
          }, {
            status: 400
          })
        }

        // 解析授权码
        let actualCode = code
        
        // 如果用户输入的是完整的回调 URL，提取其中的授权码
        if (code.includes('console.anthropic.com/oauth/code/callback')) {
          const url = new URL(code)
          const codeParam = url.searchParams.get('code')
          if (codeParam) {
            actualCode = codeParam
          }
        }

        // 使用 PKCE 参数交换 Token
        const baseUrl = process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : `http://localhost:${process.env.PORT || 3000}`
        
        tokenData = await exchangeClaudeToken(actualCode, codeVerifier, `${baseUrl}/oauth/callback`)
        userInfo = await getClaudeUserInfo(tokenData.access_token)
      } else if (provider === 'gemini') {
        tokenData = await exchangeGeminiToken(code, 'urn:ietf:wg:oauth:2.0:oob')
        userInfo = await getGeminiUserInfo(tokenData.access_token)
      }

      return NextResponse.json({
        success: true,
        data: {
          provider,
          email: userInfo.email,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in
        }
      })
    } catch (tokenError) {
      console.error('OAuth token exchange failed:', tokenError)
      const errorMessage = tokenError instanceof Error ? tokenError.message : 'Token exchange failed'
      
      return NextResponse.json({
        error: 'Token 交换失败',
        message: errorMessage,
        details: provider === 'claude' 
          ? '建议使用手动输入模式直接输入 Access Token 和 Refresh Token'
          : '请检查授权码是否正确'
      }, {
        status: 400
      })
    }
  } catch (error) {
    console.error('OAuth code exchange error:', error)
    
    return NextResponse.json({
      error: '授权码交换失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}