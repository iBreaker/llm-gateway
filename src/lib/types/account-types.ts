// 上游账号类型定义

export type AccountType = 'gemini_oauth' | 'claude_oauth' | 'llm_gateway'

export interface BaseUpstreamAccount {
  id: number
  type: AccountType
  email?: string
  user_id?: string
  is_active: boolean
  priority: number
  weight: number
  last_used_at?: string
  request_count: number
  success_count: number
  error_count: number
  created_at: string
  updated_at: string
  last_health_check?: string
  health_status: 'healthy' | 'unhealthy' | 'unknown'
}

// Gemini OAuth 账号凭证
export interface GeminiOAuthCredentials {
  access_token: string
  refresh_token: string
  expires_at: string
  client_id?: string
  scope?: string
}

export interface GeminiOAuthAccount extends BaseUpstreamAccount {
  type: 'gemini_oauth'
  email: string
  credentials: GeminiOAuthCredentials
}

// Claude OAuth 账号凭证
export interface ClaudeOAuthCredentials {
  access_token: string
  refresh_token: string
  expires_at: string
  client_id?: string
  scope?: string
}

export interface ClaudeOAuthAccount extends BaseUpstreamAccount {
  type: 'claude_oauth'
  email: string
  credentials: ClaudeOAuthCredentials
}

// 上游 LLM Gateway 账号凭证
export interface LLMGatewayCredentials {
  base_url: string
  api_key: string
  timeout?: number
  max_retries?: number
}

export interface LLMGatewayAccount extends BaseUpstreamAccount {
  type: 'llm_gateway'
  base_url: string
  credentials: LLMGatewayCredentials
}

// 联合类型
export type UpstreamAccount = GeminiOAuthAccount | ClaudeOAuthAccount | LLMGatewayAccount

// 账号创建和更新的输入类型
export interface CreateGeminiAccountInput {
  type: 'gemini_oauth'
  email: string
  credentials: GeminiOAuthCredentials
  priority?: number
  weight?: number
  user_id?: string
}

export interface CreateClaudeAccountInput {
  type: 'claude_oauth'
  email: string
  credentials: ClaudeOAuthCredentials
  priority?: number
  weight?: number
  user_id?: string
}

export interface CreateLLMGatewayAccountInput {
  type: 'llm_gateway'
  base_url: string
  credentials: LLMGatewayCredentials
  priority?: number
  weight?: number
  user_id?: string
}

export type CreateAccountInput = CreateGeminiAccountInput | CreateClaudeAccountInput | CreateLLMGatewayAccountInput

// 账号验证接口
export interface AccountValidator {
  validateCredentials(account: UpstreamAccount): Promise<boolean>
  refreshToken?(account: GeminiOAuthAccount | ClaudeOAuthAccount): Promise<void>
  healthCheck(account: UpstreamAccount): Promise<{ healthy: boolean; message?: string }>
}

// 账号管理器接口
export interface AccountManager {
  createAccount(input: CreateAccountInput): Promise<UpstreamAccount>
  updateAccount(id: number, updates: Partial<UpstreamAccount>): Promise<UpstreamAccount>
  deleteAccount(id: number): Promise<boolean>
  getAccount(id: number): Promise<UpstreamAccount | null>
  listAccounts(filters?: { type?: AccountType; is_active?: boolean }): Promise<UpstreamAccount[]>
  validateAccount(id: number): Promise<boolean>
  healthCheckAccount(id: number): Promise<{ healthy: boolean; message?: string }>
}

// 常量定义
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  gemini_oauth: 'Gemini OAuth',
  claude_oauth: 'Claude OAuth',
  llm_gateway: 'LLM Gateway'
}

export const ACCOUNT_TYPE_DESCRIPTIONS: Record<AccountType, string> = {
  gemini_oauth: '通过 Google OAuth 认证的 Gemini CLI 账号',
  claude_oauth: '通过 OAuth 认证的 Claude Code 账号',
  llm_gateway: '上游 LLM Gateway 系统账号'
}

// 账号状态常量
export const HEALTH_STATUS = {
  HEALTHY: 'healthy' as const,
  UNHEALTHY: 'unhealthy' as const,
  UNKNOWN: 'unknown' as const
}