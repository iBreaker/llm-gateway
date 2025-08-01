// Claude OAuth 账号验证器
import type { ClaudeOAuthAccount, AccountValidator } from '@/lib/types/account-types'

export class ClaudeOAuthValidator implements AccountValidator {
  private clientId: string
  private clientSecret: string
  private baseUrl: string = 'https://api.anthropic.com'

  constructor() {
    this.clientId = process.env.CLAUDE_OAUTH_CLIENT_ID || ''
    this.clientSecret = process.env.CLAUDE_OAUTH_CLIENT_SECRET || ''
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Claude OAuth credentials not configured')
    }
  }

  async validateCredentials(account: ClaudeOAuthAccount): Promise<boolean> {
    try {
      const { access_token } = account.credentials
      
      // 调用 Claude API 验证令牌
      const response = await fetch(`${this.baseUrl}/v1/auth/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return data.valid === true
      }

      return false
    } catch (error) {
      console.error('Claude OAuth 凭证验证失败:', error)
      return false
    }
  }

  async refreshToken(account: ClaudeOAuthAccount): Promise<void> {
    try {
      const { refresh_token } = account.credentials
      
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
          client_id: this.clientId,
          client_secret: this.clientSecret
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      // 更新账号凭证
      account.credentials.access_token = data.access_token
      if (data.refresh_token) {
        account.credentials.refresh_token = data.refresh_token
      }
      if (data.expires_in) {
        const expiresAt = new Date(Date.now() + data.expires_in * 1000)
        account.credentials.expires_at = expiresAt.toISOString()
      }
    } catch (error) {
      console.error('Claude OAuth 令牌刷新失败:', error)
      throw new Error('Failed to refresh Claude OAuth token')
    }
  }

  async healthCheck(account: ClaudeOAuthAccount): Promise<{ healthy: boolean; message?: string }> {
    try {
      // 检查令牌是否过期
      const expiresAt = new Date(account.credentials.expires_at)
      const now = new Date()
      
      if (expiresAt <= now) {
        // 尝试刷新令牌
        try {
          await this.refreshToken(account)
          return { healthy: true, message: 'Token refreshed successfully' }
        } catch (error) {
          return { healthy: false, message: 'Token expired and refresh failed' }
        }
      }

      // 验证凭证
      const isValid = await this.validateCredentials(account)
      
      if (isValid) {
        return { healthy: true, message: 'Credentials valid' }
      } else {
        return { healthy: false, message: 'Invalid credentials' }
      }
    } catch (error) {
      return { 
        healthy: false, 
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }
    }
  }

  // Claude 特有的方法
  async getUserInfo(account: ClaudeOAuthAccount): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/user`, {
        headers: {
          'Authorization': `Bearer ${account.credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('获取 Claude 用户信息失败:', error)
      throw error
    }
  }

  // 检查 Claude Code CLI 可用性
  async checkClaudeCodeAvailability(account: ClaudeOAuthAccount): Promise<boolean> {
    try {
      // 调用 Claude API 健康检查
      const response = await fetch(`${this.baseUrl}/v1/health`, {
        headers: {
          'Authorization': `Bearer ${account.credentials.access_token}`
        }
      })

      return response.ok
    } catch (error) {
      console.error('Claude Code CLI 可用性检查失败:', error)
      return false
    }
  }

  // 获取账号使用限制信息
  async getUsageLimits(account: ClaudeOAuthAccount): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/usage`, {
        headers: {
          'Authorization': `Bearer ${account.credentials.access_token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('获取 Claude 使用限制失败:', error)
      throw error
    }
  }
}