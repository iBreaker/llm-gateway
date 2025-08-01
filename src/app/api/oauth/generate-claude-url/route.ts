import { NextResponse } from 'next/server'
import { generateCodeVerifier, generateCodeChallenge, generateState } from '@/lib/utils/oauth-helpers'
import { OAUTH_CONFIGS } from '@/lib/config/oauth-config'

// POST /api/oauth/generate-claude-url
export async function POST() {
  try {
    // 生成 PKCE 参数
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = generateState()
    
    const config = OAUTH_CONFIGS.claude
    
    // 构建完整的授权 URL
    const authUrl = config.authorizeUrl + '?' + new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: state
    }).toString()

    return NextResponse.json({
      success: true,
      authUrl,
      codeVerifier,
      state,
      codeChallenge
    })
  } catch (error) {
    console.error('生成 Claude OAuth URL 失败:', error)
    
    return NextResponse.json({
      error: '生成授权 URL 失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}