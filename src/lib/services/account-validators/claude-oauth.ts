// Claude OAuth 账号验证器
import type { ClaudeOAuthAccount, AccountValidator } from '@/lib/types/account-types'
import { OAUTH_CONFIGS } from '@/lib/config/oauth-config'

export class ClaudeOAuthValidator implements AccountValidator {
  private config = OAUTH_CONFIGS.claude

  constructor() {
    // Claude 使用 PKCE 流程，不需要 Client Secret
    // 使用与 Claude Code CLI 相同的公开客户端 ID
  }

  async validateCredentials(account: ClaudeOAuthAccount): Promise<boolean> {
    try {
      const { access_token } = account.credentials
      
      // 调用 Claude API 验证令牌
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      })

      // 如果请求成功返回，说明 Token 有效
      return response.ok
    } catch (error) {
      console.error('Claude OAuth 凭证验证失败:', error)
      return false
    }
  }

  async refreshToken(account: ClaudeOAuthAccount): Promise<void> {
    try {
      const { refresh_token } = account.credentials
      
      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'claude-cli/1.0.56 (external, cli)',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://claude.ai/',
          'Origin': 'https://claude.ai'
        },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refresh_token,
          client_id: this.config.clientId
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
      const response = await fetch('https://api.anthropic.com/v1/user', {
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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      const response = await fetch('https://api.anthropic.com/v1/usage', {
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