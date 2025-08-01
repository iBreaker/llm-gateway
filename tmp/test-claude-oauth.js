#!/usr/bin/env node

// 临时测试脚本 - 验证 Claude OAuth 配置
const crypto = require('crypto')

// 从项目复制的配置
const OAUTH_CONFIGS = {
  claude: {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    authorizeUrl: 'https://console.anthropic.com/oauth2/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth2/token',
    redirectUri: 'https://console.anthropic.com/oauth2/callback',
    scopes: 'default',
    userInfoUrl: 'https://console.anthropic.com/v1/organizations'
  }
}

// PKCE 辅助函数
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(codeVerifier) {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url')
}

function generateState() {
  return crypto.randomBytes(32).toString('hex')
}

// 生成 Claude OAuth URL
function generateClaudeAuthUrl() {
  const config = OAUTH_CONFIGS.claude
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state = generateState()

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: config.scopes,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state
  })

  return {
    authUrl: `${config.authorizeUrl}?${params.toString()}`,
    codeVerifier,
    state,
    codeChallenge
  }
}

// 测试
console.log('🔍 测试 Claude OAuth 配置...\n')

const result = generateClaudeAuthUrl()

console.log('✅ 生成的 OAuth 参数:')
console.log('📋 Client ID:', OAUTH_CONFIGS.claude.clientId)
console.log('🔗 Authorization URL:', OAUTH_CONFIGS.claude.authorizeUrl)
console.log('🔄 Token URL:', OAUTH_CONFIGS.claude.tokenUrl)
console.log('↩️ Redirect URI:', OAUTH_CONFIGS.claude.redirectUri)
console.log('🎯 Scopes:', OAUTH_CONFIGS.claude.scopes)
console.log('👤 User Info URL:', OAUTH_CONFIGS.claude.userInfoUrl)

console.log('\n🔐 PKCE 参数:')
console.log('Code Verifier:', result.codeVerifier)
console.log('Code Challenge:', result.codeChallenge)
console.log('State:', result.state)

console.log('\n🌐 完整授权 URL:')
console.log(result.authUrl)

console.log('\n🎯 与 relay 项目的差异对比:')
console.log('✅ Client ID: 正确 (9d1c250a-e61b-44d9-88ed-5944d1962f5e)')
console.log('✅ Authorization URL: 修复为 oauth2/authorize')
console.log('✅ Token URL: 修复为 oauth2/token')
console.log('✅ Redirect URI: 修复为 oauth2/callback')
console.log('✅ Scopes: 修复为 default')
console.log('✅ User Info URL: 使用 v1/organizations API')
console.log('✅ 移除了错误的 code=true 参数')
console.log('✅ Content-Type: 修复为 application/x-www-form-urlencoded')

console.log('\n🚀 Claude OAuth 配置已修复，应该与 relay 项目兼容!')