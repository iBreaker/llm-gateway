// Gemini OAuth 账号验证器
import { OAuth2Client } from 'google-auth-library'
import type { GeminiOAuthAccount, AccountValidator } from '@/lib/types/account-types'

export class GeminiOAuthValidator implements AccountValidator {
  private client: OAuth2Client

  constructor() {
    const clientId = process.env.GEMINI_OAUTH_CLIENT_ID
    const clientSecret = process.env.GEMINI_OAUTH_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      throw new Error('Gemini OAuth credentials not configured')
    }

    this.client = new OAuth2Client(clientId, clientSecret)
  }

  async validateCredentials(account: GeminiOAuthAccount): Promise<boolean> {
    try {
      const { access_token } = account.credentials
      
      // 验证访问令牌
      const ticket = await this.client.verifyIdToken({
        idToken: access_token,
        audience: process.env.GEMINI_OAUTH_CLIENT_ID
      })

      const payload = ticket.getPayload()
      return !!payload && payload.email === account.email
    } catch (error) {
      console.error('Gemini OAuth 凭证验证失败:', error)
      return false
    }
  }

  async refreshToken(account: GeminiOAuthAccount): Promise<void> {
    try {
      this.client.setCredentials({
        refresh_token: account.credentials.refresh_token
      })

      const { credentials } = await this.client.refreshAccessToken()
      
      if (credentials.access_token) {
        // 更新账号凭证
        account.credentials.access_token = credentials.access_token
        if (credentials.expiry_date) {
          account.credentials.expires_at = new Date(credentials.expiry_date).toISOString()
        }
      }
    } catch (error) {
      console.error('Gemini OAuth 令牌刷新失败:', error)
      throw new Error('Failed to refresh Gemini OAuth token')
    }
  }

  async healthCheck(account: GeminiOAuthAccount): Promise<{ healthy: boolean; message?: string }> {
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

  // Gemini 特有的方法
  async getUserInfo(account: GeminiOAuthAccount): Promise<any> {
    try {
      this.client.setCredentials({
        access_token: account.credentials.access_token
      })

      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${account.credentials.access_token}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('获取 Gemini 用户信息失败:', error)
      throw error
    }
  }

  // 检查 Gemini CLI 可用性
  async checkGeminiCLIAvailability(account: GeminiOAuthAccount): Promise<boolean> {
    try {
      // 这里可以调用 Gemini CLI 的健康检查接口
      // 目前返回基本的令牌验证结果
      return await this.validateCredentials(account)
    } catch (error) {
      console.error('Gemini CLI 可用性检查失败:', error)
      return false
    }
  }
}