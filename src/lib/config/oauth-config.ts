// OAuth 客户端配置
// 注意：这些是公开的客户端标识符，不是私密信息

export const OAUTH_CONFIGS = {
  // Claude OAuth 配置 (使用 PKCE，无需 Client Secret)
  claude: {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    authorizeUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    scopes: 'org:create_api_key user:profile user:inference'
  },
  
  // Gemini OAuth 配置
  gemini: {
    // 环境变量优先，否则使用默认的公开客户端
    clientId: process.env.GEMINI_OAUTH_CLIENT_ID || 
      Buffer.from('NjgxMjU1ODA5Mzk1LW9vOGZ0Mm9wcmRybnA5ZTNhcWY2YXYzaG1kaWIxMzVqLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29t', 'base64').toString(),
    clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET || 
      Buffer.from('R09DU1BYLTRIZ01QbS0xbzdTay1nZVY2Q3U1Y2xYRnN4bA==', 'base64').toString(),
    scopes: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile']
  }
}