/**
 * Claude Code OAuth 助手
 * 基于 claude-relay-service 的 oauthHelper.js 实现
 */

import crypto from 'crypto'

// OAuth 配置常量 - 来自 Claude CLI
export const CLAUDE_OAUTH_CONFIG = {
  AUTHORIZE_URL: 'https://claude.ai/oauth/authorize',
  TOKEN_URL: 'https://console.anthropic.com/v1/oauth/token',
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  REDIRECT_URI: 'https://console.anthropic.com/oauth/code/callback',
  SCOPES: 'org:create_api_key user:profile user:inference'
}

/**
 * 生成随机的 state 参数
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * 生成随机的 code verifier（PKCE）
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * 生成 code challenge（PKCE）
 */
export function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
}

/**
 * 生成授权 URL
 */
export function generateAuthUrl(codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    code: 'true',
    client_id: CLAUDE_OAUTH_CONFIG.CLIENT_ID,
    response_type: 'code',
    redirect_uri: CLAUDE_OAUTH_CONFIG.REDIRECT_URI,
    scope: CLAUDE_OAUTH_CONFIG.SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state
  })

  return `${CLAUDE_OAUTH_CONFIG.AUTHORIZE_URL}?${params.toString()}`
}

/**
 * 生成 OAuth 授权参数
 */
export function generateOAuthParams() {
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  
  const authUrl = generateAuthUrl(codeChallenge, state)
  
  return {
    authUrl,
    codeVerifier,
    state,
    codeChallenge
  }
}

/**
 * 解析回调 URL 或授权码
 */
export function parseCallbackUrl(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('请提供有效的授权码或回调 URL')
  }

  const trimmedInput = input.trim()
  
  // 情况1: 尝试作为完整URL解析
  if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
    try {
      const urlObj = new URL(trimmedInput)
      const authorizationCode = urlObj.searchParams.get('code')

      if (!authorizationCode) {
        throw new Error('回调 URL 中未找到授权码 (code 参数)')
      }

      return authorizationCode
    } catch (error) {
      if (error instanceof Error && error.message.includes('回调 URL 中未找到授权码')) {
        throw error
      }
      throw new Error('无效的 URL 格式，请检查回调 URL 是否正确')
    }
  }
  
  // 情况2: 直接的授权码（可能包含URL fragments）
  const cleanedCode = trimmedInput.split('#')[0]?.split('&')[0] ?? trimmedInput
  
  // 验证授权码格式
  if (!cleanedCode || cleanedCode.length < 10) {
    throw new Error('授权码格式无效，请确保复制了完整的 Authorization Code')
  }
  
  // 基本格式验证：授权码应该只包含字母、数字、下划线、连字符
  const validCodePattern = /^[A-Za-z0-9_-]+$/
  if (!validCodePattern.test(cleanedCode)) {
    throw new Error('授权码包含无效字符，请检查是否复制了正确的 Authorization Code')
  }
  
  return cleanedCode
}

/**
 * 使用授权码交换访问令牌
 */
export async function exchangeCodeForTokens(
  authorizationCode: string,
  codeVerifier: string,
  state: string
): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
}> {
  // 清理授权码，移除URL片段
  const cleanedCode = authorizationCode.split('#')[0]?.split('&')[0] ?? authorizationCode
  
  const params = {
    grant_type: 'authorization_code',
    client_id: CLAUDE_OAUTH_CONFIG.CLIENT_ID,
    code: cleanedCode,
    redirect_uri: CLAUDE_OAUTH_CONFIG.REDIRECT_URI,
    code_verifier: codeVerifier,
    state: state
  }

  try {
    const response = await fetch(CLAUDE_OAUTH_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-cli/1.0.56 (external, cli)',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://claude.ai/',
        'Origin': 'https://claude.ai'
      },
      body: JSON.stringify(params)
    })

    if (!response.ok) {
      const errorData = await response.text()
      throw new Error(`Token exchange failed: HTTP ${response.status} - ${errorData}`)
    }

    const data = await response.json()
    
    // 返回标准格式的token数据
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: (Math.floor(Date.now() / 1000) + data.expires_in) * 1000,
      scopes: data.scope ? data.scope.split(' ') : ['user:inference', 'user:profile']
    }
  } catch (error) {
    throw new Error(`Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * 格式化为标准凭据格式
 */
export function formatClaudeCredentials(tokenData: {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
}) {
  return {
    type: 'CLAUDE_CODE',
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    expiresAt: tokenData.expiresAt,
    scopes: tokenData.scopes
  }
}