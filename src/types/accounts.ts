export interface UpstreamAccount {
  id: number
  name: string
  accountType: string
  provider: string
  status: string
  isActive: boolean
  createdAt: string
  lastHealthCheck?: string
  requestCount: number
  successRate: number
}

export interface CreateAccountData {
  name: string
  type: string
  provider: string
  credentials: any
  config?: {
    timeout?: number
    retry_count?: number
  }
  priority?: number
  weight?: number
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