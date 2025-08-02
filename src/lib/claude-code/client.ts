/**
 * Claude Code 客户端，用于健康检查和 API 调用
 */

export interface ClaudeCodeCredentials {
  type: 'CLAUDE_CODE'
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
}

export interface ClaudeCodeHealthResult {
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
 * Claude Code 客户端
 */
export class ClaudeCodeClient {
  private credentials: ClaudeCodeCredentials

  constructor(credentials: ClaudeCodeCredentials) {
    this.credentials = credentials
  }

  /**
   * 检查访问令牌是否有效
   */
  async validateCredentials(): Promise<ClaudeCodeHealthResult> {
    try {
      // 检查令牌是否过期
      if (Date.now() >= this.credentials.expiresAt) {
        return {
          valid: false,
          error: '访问令牌已过期，需要刷新'
        }
      }

      console.log(`验证Claude Code访问令牌: ${this.credentials.accessToken.substring(0, 10)}...`)
      
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

      console.log(`Claude Code API响应状态: ${response.status} ${response.statusText}`)

      if (response.ok) {
        try {
          const data = await response.json()
          console.log('Claude Code OAuth验证成功:', data)
          
          return {
            valid: true,
            userInfo: {
              id: 'claude-code-user',
              email: 'unknown',
              name: 'Claude Code User'
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
      console.error('Claude Code令牌验证失败:', error)
      
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
}

/**
 * 验证 Claude Code 凭据格式
 */
export function validateClaudeCodeCredentials(credentials: any): { valid: boolean, error?: string } {
  if (!credentials || typeof credentials !== 'object') {
    return { valid: false, error: '凭据格式无效' }
  }

  if (credentials.type !== 'CLAUDE_CODE') {
    return { valid: false, error: '凭据类型不是 CLAUDE_CODE' }
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