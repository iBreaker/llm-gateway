// OAuth 授权流程辅助函数
import crypto from 'crypto'
import { OAUTH_CONFIGS } from '@/lib/config/oauth-config'

export type OAuthProvider = 'claude' | 'gemini'

// PKCE 相关函数（用于 Claude OAuth）
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

export function generateState(): string {
  return crypto.randomBytes(32).toString('hex')
}

// 生成 Claude OAuth 授权 URL
export function generateClaudeAuthUrl(redirectUri: string): {
  authUrl: string
  codeVerifier: string
  state: string
} {
  const config = OAUTH_CONFIGS.claude
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  const params = new URLSearchParams({
    code: 'true',
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: config.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state
  })

  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    codeVerifier,
    state
  }
}

// 生成 Gemini OAuth 授权 URL
export function generateGeminiAuthUrl(redirectUri: string): {
  authUrl: string
  state: string
} {
  const config = OAUTH_CONFIGS.gemini
  const state = generateState()

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    state: state,
    access_type: 'offline', // 获取 refresh token
    prompt: 'consent' // 强制显示同意页面以获取 refresh token
  })

  return {
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state
  }
}

// 使用授权码交换 Claude Token
export async function exchangeClaudeToken(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  state?: string
): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const config = OAUTH_CONFIGS.claude
  
  // 构建请求参数，包含所有必需的字段
  const params: any = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  }
  
  // 如果提供了 state 参数，添加到请求中
  if (state) {
    params.state = state
  }
  
  const response = await fetch(config.tokenUrl, {
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
    throw new Error(`Claude OAuth token exchange failed: ${response.status} ${errorData}`)
  }

  return await response.json()
}

// 使用授权码交换 Gemini Token
export async function exchangeGeminiToken(
  code: string,
  redirectUri: string
): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
}> {
  const config = OAUTH_CONFIGS.gemini
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code,
      redirect_uri: redirectUri
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Gemini OAuth token exchange failed: ${response.status} ${errorData}`)
  }

  return await response.json()
}

// 获取用户信息
export async function getClaudeUserInfo(accessToken: string): Promise<{ email: string }> {
  const response = await fetch('https://api.anthropic.com/v1/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to get Claude user info: ${response.status}`)
  }

  return await response.json()
}

export async function getGeminiUserInfo(accessToken: string): Promise<{ email: string }> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to get Gemini user info: ${response.status}`)
  }

  return await response.json()
}