/**
 * Anthropic OAuth 客户端，用于健康检查和 API 调用
 */

export interface AnthropicOAuthCredentials {
  type: 'ANTHROPIC_OAUTH' | 'CLAUDE_CODE'
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
}

export interface AnthropicOAuthHealthResult {
  valid: boolean
  error?: string
  details?: any
  userInfo?: {
    id: string
    email?: string
    name?: string
  }
}

/**
 * Anthropic OAuth 客户端
 */
export class AnthropicOAuthClient {
  private credentials: AnthropicOAuthCredentials

  constructor(credentials: AnthropicOAuthCredentials) {
    this.credentials = credentials
  }

  /**
   * 检查访问令牌是否有效
   */
  async validateCredentials(): Promise<AnthropicOAuthHealthResult> {
    try {
      // 检查令牌是否过期
      if (Date.now() >= this.credentials.expiresAt) {
        return {
          valid: false,
          error: '访问令牌已过期，需要刷新'
        }
      }

      console.log(`验证Anthropic OAuth访问令牌: ${this.credentials.accessToken.substring(0, 10)}...`)
      
      // 调用OAuth hello接口验证令牌
      const response = await fetch('https://console.anthropic.com/v1/oauth/hello', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'claude-cli/1.0.56 (external, cli)',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://claude.ai/',
          'Origin': 'https://claude.ai'
        }
      })

      console.log(`Anthropic OAuth API响应状态: ${response.status} ${response.statusText}`)

      if (response.ok) {
        try {
          const data = await response.json()
          console.log('Anthropic OAuth验证成功:', data)
          
          return {
            valid: true,
            userInfo: {
              id: 'anthropic-oauth-user',
              email: 'unknown',
              name: 'Anthropic OAuth User'
            }
          }
        } catch (parseError) {
          // 即使解析失败，如果状态码是200，说明令牌是有效的
          console.warn('解析响应失败，但令牌验证成功:', parseError)
          return {
            valid: true,
            error: '令牌有效但无法解析响应'
          }
        }
      } else {
        const errorText = await response.text().catch(() => '无法读取错误响应')
        
        if (response.status === 401) {
          return {
            valid: false,
            error: '访问令牌无效或已过期'
          }
        } else if (response.status === 403) {
          return {
            valid: false,
            error: '访问令牌权限不足'
          }
        } else {
          return {
            valid: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            details: errorText
          }
        }
      }
    } catch (error: any) {
      console.error('Anthropic OAuth令牌验证失败:', error)
      
      // 网络错误
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return {
          valid: false,
          error: `网络连接失败: ${error.message}`,
          details: error
        }
      }
      
      // 其他错误
      return {
        valid: false,
        error: `验证失败: ${error.message}`,
        details: error
      }
    }
  }

  /**
   * 检查令牌是否即将过期（剩余时间少于1小时）
   */
  isTokenExpiringSoon(): boolean {
    const oneHour = 60 * 60 * 1000 // 1小时的毫秒数
    return Date.now() + oneHour >= this.credentials.expiresAt
  }

  /**
   * 获取令牌剩余有效时间（毫秒）
   */
  getTimeToExpiry(): number {
    return Math.max(0, this.credentials.expiresAt - Date.now())
  }

  /**
   * 格式化令牌剩余时间
   */
  getFormattedTimeToExpiry(): string {
    const timeLeft = this.getTimeToExpiry()
    
    if (timeLeft === 0) {
      return '已过期'
    }
    
    const hours = Math.floor(timeLeft / (60 * 60 * 1000))
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000))
    
    if (hours > 0) {
      return `${hours}小时${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
  }

  /**
   * 使用refresh token刷新访问令牌
   */
  async refreshAccessToken(): Promise<{ success: boolean, credentials?: AnthropicOAuthCredentials, error?: string }> {
    try {
      console.log('正在刷新Anthropic OAuth访问令牌...')
      
      // Claude AI OAuth token refresh endpoint
      const response = await fetch('https://console.anthropic.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'claude-cli/1.0.56 (external, cli)',
          'Accept': 'application/json',
          'Origin': 'https://claude.ai',
          'Referer': 'https://claude.ai/'
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.refreshToken
        }).toString()
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '无法读取错误响应')
        console.error(`Token刷新失败: ${response.status} ${response.statusText}`, errorText)
        
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText} - ${errorText}`
        }
      }

      const tokenData = await response.json()
      console.log('Token刷新成功，收到新token')

      // 计算新的过期时间
      const expiresAt = Date.now() + (tokenData.expires_in * 1000)
      
      const newCredentials: AnthropicOAuthCredentials = {
        type: this.credentials.type, // 保持原来的类型
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || this.credentials.refreshToken, // 某些实现可能不返回新的refresh token
        expiresAt,
        scopes: this.credentials.scopes
      }

      // 更新当前实例的凭据
      this.credentials = newCredentials

      return {
        success: true,
        credentials: newCredentials
      }

    } catch (error: any) {
      console.error('Token刷新过程中发生错误:', error)
      
      return {
        success: false,
        error: `刷新失败: ${error.message}`
      }
    }
  }

  /**
   * 自动检查并刷新token（如果需要的话）
   * @param forceRefresh 是否强制刷新，无论是否即将过期
   */
  async ensureValidToken(forceRefresh: boolean = false): Promise<{ success: boolean, refreshed: boolean, credentials?: AnthropicOAuthCredentials, error?: string }> {
    try {
      // 检查是否需要刷新
      const isExpired = Date.now() >= this.credentials.expiresAt
      const expiringSoon = this.isTokenExpiringSoon()
      
      if (!forceRefresh && !isExpired && !expiringSoon) {
        return {
          success: true,
          refreshed: false,
          credentials: this.credentials
        }
      }

      console.log(`Token需要刷新: 已过期=${isExpired}, 即将过期=${expiringSoon}, 强制刷新=${forceRefresh}`)

      // 尝试刷新token
      const refreshResult = await this.refreshAccessToken()
      
      if (refreshResult.success) {
        return {
          success: true,
          refreshed: true,
          credentials: refreshResult.credentials
        }
      } else {
        return {
          success: false,
          refreshed: false,
          error: refreshResult.error
        }
      }

    } catch (error: any) {
      console.error('确保有效token时发生错误:', error)
      
      return {
        success: false,
        refreshed: false,
        error: `检查token时出错: ${error.message}`
      }
    }
  }
}

/**
 * 验证 Anthropic OAuth 凭据格式
 */
export function validateAnthropicOAuthCredentials(credentials: any): { valid: boolean, error?: string } {
  if (!credentials || typeof credentials !== 'object') {
    return { valid: false, error: '凭据格式无效' }
  }

  if (credentials.type !== 'ANTHROPIC_OAUTH' && credentials.type !== 'CLAUDE_CODE') {
    return { valid: false, error: `不支持的凭据类型: ${credentials.type}` }
  }

  if (!credentials.accessToken || typeof credentials.accessToken !== 'string') {
    return { valid: false, error: '缺少有效的访问令牌' }
  }

  if (!credentials.refreshToken || typeof credentials.refreshToken !== 'string') {
    return { valid: false, error: '缺少有效的刷新令牌' }
  }

  if (!credentials.expiresAt || typeof credentials.expiresAt !== 'number') {
    return { valid: false, error: '缺少有效的过期时间' }
  }

  if (!Array.isArray(credentials.scopes)) {
    return { valid: false, error: '缺少有效的权限范围' }
  }

  return { valid: true }
}