import { NextRequest, NextResponse } from 'next/server'
import { exchangeClaudeToken, exchangeGeminiToken, getClaudeUserInfo, getGeminiUserInfo } from '@/lib/utils/oauth-helpers'

// GET /api/oauth/callback
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(`${getBaseUrl(request)}/dashboard/accounts?oauth_error=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${getBaseUrl(request)}/dashboard/accounts?oauth_error=missing_params`)
    }

    // 在实际应用中，应该从 session 或数据库中验证 state 参数
    // 这里为了演示，我们通过 URL 参数传递必要信息
    const provider = searchParams.get('provider') || 'claude' // 默认 Claude
    const codeVerifier = searchParams.get('code_verifier') // 仅 Claude 需要

    const baseUrl = getBaseUrl(request)
    const redirectUri = `${baseUrl}/api/oauth/callback`

    let tokenData: any
    let userInfo: any

    try {
      if (provider === 'claude') {
        if (!codeVerifier) {
          throw new Error('Missing code_verifier for Claude OAuth')
        }
        tokenData = await exchangeClaudeToken(code, codeVerifier, redirectUri)
        userInfo = await getClaudeUserInfo(tokenData.access_token)
      } else if (provider === 'gemini') {
        tokenData = await exchangeGeminiToken(code, redirectUri)
        userInfo = await getGeminiUserInfo(tokenData.access_token)
      } else {
        throw new Error('Unsupported OAuth provider')
      }

      // 构建成功页面的 URL，包含账号信息
      const successUrl = new URL(`${baseUrl}/dashboard/accounts`)
      successUrl.searchParams.set('oauth_success', 'true')
      successUrl.searchParams.set('provider', provider)
      successUrl.searchParams.set('email', userInfo.email)
      successUrl.searchParams.set('access_token', tokenData.access_token)
      successUrl.searchParams.set('refresh_token', tokenData.refresh_token)
      successUrl.searchParams.set('expires_in', tokenData.expires_in.toString())

      return NextResponse.redirect(successUrl.toString())
    } catch (tokenError) {
      console.error('OAuth token exchange failed:', tokenError)
      const errorMessage = tokenError instanceof Error ? tokenError.message : 'Token exchange failed'
      return NextResponse.redirect(`${baseUrl}/dashboard/accounts?oauth_error=${encodeURIComponent(errorMessage)}`)
    }
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(`${getBaseUrl(request)}/dashboard/accounts?oauth_error=callback_failed`)
  }
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  return `${protocol}://${host}`
}