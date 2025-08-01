// 统一账号管理器
import type { 
  UpstreamAccount, 
  AccountType, 
  CreateAccountInput, 
  AccountManager,
  GeminiOAuthAccount,
  ClaudeOAuthAccount,
  LLMGatewayAccount
} from '@/lib/types/account-types'
import { GeminiOAuthValidator } from './account-validators/gemini-oauth'
import { ClaudeOAuthValidator } from './account-validators/claude-oauth'
import { LLMGatewayValidator } from './account-validators/llm-gateway'
import { getDatabase } from '@/lib/server-init'

export class UnifiedAccountManager implements AccountManager {
  private validators: Map<AccountType, any>

  constructor() {
    this.validators = new Map()
    
    // 初始化验证器（延迟加载，避免环境变量问题）
    this.initializeValidators()
  }

  private initializeValidators() {
    try {
      if (process.env.GEMINI_OAUTH_CLIENT_ID && process.env.GEMINI_OAUTH_CLIENT_SECRET) {
        this.validators.set('gemini_oauth', new GeminiOAuthValidator())
      }
    } catch (error) {
      console.warn('Gemini OAuth 验证器初始化失败:', error)
    }

    try {
      if (process.env.CLAUDE_OAUTH_CLIENT_ID && process.env.CLAUDE_OAUTH_CLIENT_SECRET) {
        this.validators.set('claude_oauth', new ClaudeOAuthValidator())
      }
    } catch (error) {
      console.warn('Claude OAuth 验证器初始化失败:', error)
    }

    // LLM Gateway 验证器不需要特殊配置
    this.validators.set('llm_gateway', new LLMGatewayValidator())
  }

  async createAccount(input: CreateAccountInput): Promise<UpstreamAccount> {
    const db = await getDatabase()
    
    // 准备数据库插入数据
    const accountData: any = {
      type: input.type,
      is_active: true,
      priority: input.priority || 1,
      weight: input.weight || 100,
      health_status: 'unknown'
    }

    // 根据账号类型设置特定字段
    switch (input.type) {
      case 'gemini_oauth':
      case 'claude_oauth':
        accountData.email = input.email
        accountData.credentials = JSON.stringify(input.credentials)
        break
      case 'llm_gateway':
        accountData.base_url = input.base_url
        accountData.credentials = JSON.stringify(input.credentials)
        break
    }

    // 插入数据库
    const newAccount = await db.create('upstream_accounts', accountData)
    
    // 返回格式化的账号数据
    return this.formatAccount(newAccount)
  }

  async updateAccount(id: number, updates: Partial<UpstreamAccount>): Promise<UpstreamAccount> {
    const db = await getDatabase()
    
    const updateData: any = {}
    
    // 准备更新数据
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active
    if (updates.priority !== undefined) updateData.priority = updates.priority
    if (updates.weight !== undefined) updateData.weight = updates.weight
    if (updates.health_status !== undefined) updateData.health_status = updates.health_status
    
    // 处理凭证更新
    if ('credentials' in updates && updates.credentials) {
      updateData.credentials = JSON.stringify(updates.credentials)
    }
    
    // 处理特定类型字段
    if ('email' in updates && updates.email) {
      updateData.email = updates.email
    }
    if ('base_url' in updates && updates.base_url) {
      updateData.base_url = updates.base_url
    }

    updateData.updated_at = new Date().toISOString()

    const updatedAccount = await db.update('upstream_accounts', { id }, updateData)
    return this.formatAccount(updatedAccount)
  }

  async deleteAccount(id: number): Promise<boolean> {
    const db = await getDatabase()
    const result = await db.delete('upstream_accounts', { id })
    return result > 0
  }

  async getAccount(id: number): Promise<UpstreamAccount | null> {
    const db = await getDatabase()
    const account = await db.findOne('upstream_accounts', { id })
    
    if (!account) return null
    return this.formatAccount(account)
  }

  async listAccounts(filters?: { type?: AccountType; is_active?: boolean }): Promise<UpstreamAccount[]> {
    const db = await getDatabase()
    const where: any = {}
    
    if (filters?.type) where.type = filters.type
    if (filters?.is_active !== undefined) where.is_active = filters.is_active

    const accounts = await db.findMany('upstream_accounts', where)
    return accounts.map(account => this.formatAccount(account))
  }

  async validateAccount(id: number): Promise<boolean> {
    const account = await this.getAccount(id)
    if (!account) return false

    const validator = this.validators.get(account.type)
    if (!validator) {
      console.warn(`No validator found for account type: ${account.type}`)
      return false
    }

    return await validator.validateCredentials(account)
  }

  async healthCheckAccount(id: number): Promise<{ healthy: boolean; message?: string }> {
    const account = await this.getAccount(id)
    if (!account) {
      return { healthy: false, message: 'Account not found' }
    }

    const validator = this.validators.get(account.type)
    if (!validator) {
      return { healthy: false, message: `No validator for account type: ${account.type}` }
    }

    const result = await validator.healthCheck(account)
    
    // 更新数据库中的健康状态
    await this.updateAccount(id, {
      health_status: result.healthy ? 'healthy' : 'unhealthy',
      last_health_check: new Date().toISOString()
    } as any)

    return result
  }

  // 批量健康检查
  async healthCheckAllAccounts(): Promise<{ [id: number]: { healthy: boolean; message?: string } }> {
    const accounts = await this.listAccounts({ is_active: true })
    const results: { [id: number]: { healthy: boolean; message?: string } } = {}

    await Promise.all(
      accounts.map(async (account) => {
        try {
          results[account.id] = await this.healthCheckAccount(account.id)
        } catch (error) {
          results[account.id] = {
            healthy: false,
            message: `Health check error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        }
      })
    )

    return results
  }

  // 刷新 OAuth 令牌
  async refreshAccountToken(id: number): Promise<boolean> {
    const account = await this.getAccount(id)
    if (!account) return false

    if (account.type !== 'gemini_oauth' && account.type !== 'claude_oauth') {
      return true // LLM Gateway 不需要刷新令牌
    }

    const validator = this.validators.get(account.type)
    if (!validator || !validator.refreshToken) return false

    try {
      await validator.refreshToken(account as GeminiOAuthAccount | ClaudeOAuthAccount)
      
      // 更新数据库中的凭证
      await this.updateAccount(id, {
        credentials: account.credentials
      } as any)

      return true
    } catch (error) {
      console.error(`刷新账号 ${id} 令牌失败:`, error)
      return false
    }
  }

  // 格式化账号数据
  private formatAccount(rawAccount: any): UpstreamAccount {
    const baseAccount = {
      id: rawAccount.id,
      type: rawAccount.type,
      is_active: rawAccount.is_active,
      priority: rawAccount.priority,
      weight: rawAccount.weight,
      last_used_at: rawAccount.last_used_at,
      request_count: rawAccount.request_count || 0,
      success_count: rawAccount.success_count || 0,
      error_count: rawAccount.error_count || 0,
      created_at: rawAccount.created_at,
      updated_at: rawAccount.updated_at,
      last_health_check: rawAccount.last_health_check,
      health_status: rawAccount.health_status || 'unknown'
    }

    // 解析凭证
    const credentials = typeof rawAccount.credentials === 'string' 
      ? JSON.parse(rawAccount.credentials) 
      : rawAccount.credentials

    switch (rawAccount.type) {
      case 'gemini_oauth':
      case 'claude_oauth':
        return {
          ...baseAccount,
          email: rawAccount.email,
          credentials
        } as GeminiOAuthAccount | ClaudeOAuthAccount

      case 'llm_gateway':
        return {
          ...baseAccount,
          base_url: rawAccount.base_url,
          credentials
        } as LLMGatewayAccount

      default:
        throw new Error(`Unknown account type: ${rawAccount.type}`)
    }
  }
}

// 导出单例实例
export const accountManager = new UnifiedAccountManager()