export interface UpstreamAccount {
  id: number
  name: string
  serviceProvider: string   // API自动转换为camelCase
  authMethod: string
  status: string
  isActive: boolean
  createdAt: string
  requestCount: number
  successRate: number
  oauthExpiresAt?: number
  oauthScopes?: string
}

export interface CreateAccountData {
  name: string
  serviceProvider: string
  authMethod: string
  priority?: number         // 优先级
  weight?: number          // 权重
  // 根据后端DTO的AccountCredentials结构定义
  apiKey?: string           // API Key认证使用
  oauthAccessToken?: string // OAuth认证使用
  oauthRefreshToken?: string
  oauthExpiresAt?: number
  oauthScopes?: string
  baseUrl?: string          // 可选的基础URL
  extraConfig?: any         // 额外配置
}

export interface UpdateAccountData {
  name: string
  is_active: boolean
  credentials?: any
}

export interface OAuthSession {
  authUrl: string
  sessionId: string
  expiresAt: string
  instructions: string[]
}

export interface OAuthExchangeRequest {
  sessionId: string
  callbackUrl: string
}