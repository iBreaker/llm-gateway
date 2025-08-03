/**
 * OAuth Token 管理服务
 * 负责定期检查和刷新所有OAuth账号的访问令牌
 */

import { PrismaClient } from '@prisma/client'
import { AnthropicOAuthClient, AnthropicOAuthCredentials } from '../anthropic-oauth/client'

export interface TokenRefreshResult {
  accountId: bigint
  success: boolean
  refreshed: boolean
  error?: string
  oldExpiresAt?: number
  newExpiresAt?: number
}

/**
 * OAuth Token 管理器
 */
export class OAuthTokenManager {
  private prisma: PrismaClient
  private refreshIntervalId: NodeJS.Timeout | null = null
  private isRefreshing: boolean = false

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  /**
   * 启动定期token刷新（每30分钟检查一次）
   */
  startAutoRefresh(): void {
    if (this.refreshIntervalId) {
      console.log('OAuth token自动刷新已经在运行')
      return
    }

    console.log('启动OAuth token自动刷新服务')
    
    // 立即执行一次检查
    this.checkAndRefreshAllTokens().catch(error => {
      console.error('初始token检查失败:', error)
    })

    // 每30分钟检查一次
    this.refreshIntervalId = setInterval(async () => {
      try {
        await this.checkAndRefreshAllTokens()
      } catch (error) {
        console.error('定期token检查失败:', error)
      }
    }, 30 * 60 * 1000) // 30分钟
  }

  /**
   * 停止定期token刷新
   */
  stopAutoRefresh(): void {
    if (this.refreshIntervalId) {
      clearInterval(this.refreshIntervalId)
      this.refreshIntervalId = null
      console.log('OAuth token自动刷新服务已停止')
    }
  }

  /**
   * 检查并刷新所有OAuth账号的token
   */
  async checkAndRefreshAllTokens(): Promise<TokenRefreshResult[]> {
    if (this.isRefreshing) {
      console.log('Token刷新正在进行中，跳过此次检查')
      return []
    }

    this.isRefreshing = true
    const results: TokenRefreshResult[] = []

    try {
      console.log('开始检查所有OAuth账号的token状态...')

      // 获取所有OAuth账号
      const oauthAccounts = await this.prisma.upstreamAccount.findMany({
        where: {
          type: 'ANTHROPIC_OAUTH',
          status: 'ACTIVE'
        }
      })

      console.log(`找到 ${oauthAccounts.length} 个活跃的OAuth账号`)

      // 并行处理所有账号
      const refreshPromises = oauthAccounts.map(account => 
        this.checkAndRefreshToken(account.id, account.credentials)
      )

      const refreshResults = await Promise.allSettled(refreshPromises)

      // 收集结果
      refreshResults.forEach((result, index) => {
        const accountId = oauthAccounts[index].id
        
        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          console.error(`账号 ${accountId} token检查失败:`, result.reason)
          results.push({
            accountId,
            success: false,
            refreshed: false,
            error: result.reason?.message || '未知错误'
          })
        }
      })

      // 输出汇总信息
      const successCount = results.filter(r => r.success).length
      const refreshedCount = results.filter(r => r.refreshed).length
      const errorCount = results.filter(r => !r.success).length

      console.log(`Token检查完成: ${successCount}个成功, ${refreshedCount}个已刷新, ${errorCount}个失败`)

      return results

    } catch (error: any) {
      console.error('批量token检查失败:', error)
      throw error
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * 检查并刷新单个账号的token
   */
  async checkAndRefreshToken(accountId: bigint, credentials: any): Promise<TokenRefreshResult> {
    try {
      // 解析凭据
      const creds = typeof credentials === 'object' ? credentials : JSON.parse(credentials as string)
      
      if (creds.type !== 'ANTHROPIC_OAUTH') {
        return {
          accountId,
          success: false,
          refreshed: false,
          error: '不是OAuth类型账号'
        }
      }

      const oauthClient = new AnthropicOAuthClient(creds as AnthropicOAuthCredentials)
      const oldExpiresAt = creds.expiresAt

      console.log(`检查账号 ${accountId} 的token状态 (过期时间: ${new Date(oldExpiresAt).toLocaleString()})`)

      // 检查并刷新token
      const tokenResult = await oauthClient.ensureValidToken()

      if (!tokenResult.success) {
        console.error(`账号 ${accountId} token检查失败:`, tokenResult.error)
        
        // 如果token无效且无法刷新，标记账号为失败状态
        await this.markAccountAsFailed(accountId, tokenResult.error || '未知错误')
        
        return {
          accountId,
          success: false,
          refreshed: false,
          error: tokenResult.error,
          oldExpiresAt
        }
      }

      if (tokenResult.refreshed && tokenResult.credentials) {
        // token已刷新，更新数据库
        console.log(`账号 ${accountId} token已刷新，更新数据库`)
        
        await this.updateAccountCredentials(accountId, tokenResult.credentials)
        
        return {
          accountId,
          success: true,
          refreshed: true,
          oldExpiresAt,
          newExpiresAt: tokenResult.credentials.expiresAt
        }
      } else {
        // token仍然有效，无需刷新
        return {
          accountId,
          success: true,
          refreshed: false,
          oldExpiresAt
        }
      }

    } catch (error: any) {
      console.error(`账号 ${accountId} token检查出错:`, error)
      
      return {
        accountId,
        success: false,
        refreshed: false,
        error: error.message,
      }
    }
  }

  /**
   * 更新账号凭据
   */
  private async updateAccountCredentials(accountId: bigint, newCredentials: AnthropicOAuthCredentials): Promise<void> {
    try {
      await this.prisma.upstreamAccount.update({
        where: { id: accountId },
        data: {
          credentials: newCredentials as any,
          lastUsedAt: new Date(),
          updatedAt: new Date()
        }
      })

      console.log(`账号 ${accountId} 凭据已更新`)
    } catch (error: any) {
      console.error(`更新账号 ${accountId} 凭据失败:`, error)
      throw error
    }
  }

  /**
   * 标记账号为失败状态
   */
  private async markAccountAsFailed(accountId: bigint, reason: string): Promise<void> {
    try {
      await this.prisma.upstreamAccount.update({
        where: { id: accountId },
        data: {
          status: 'FAILED' as any,
          healthStatus: {
            status: 'error',
            lastCheck: new Date().toISOString(),
            error: reason
          } as any,
          updatedAt: new Date()
        }
      })

      console.log(`账号 ${accountId} 已标记为失败状态: ${reason}`)
    } catch (error: any) {
      console.error(`标记账号 ${accountId} 为失败状态时出错:`, error)
    }
  }

  /**
   * 手动刷新指定账号的token
   */
  async refreshTokenForAccount(accountId: bigint): Promise<TokenRefreshResult> {
    try {
      const account = await this.prisma.upstreamAccount.findUnique({
        where: { id: accountId }
      })

      if (!account) {
        return {
          accountId,
          success: false,
          refreshed: false,
          error: '账号不存在'
        }
      }

      if (account.type !== 'ANTHROPIC_OAUTH') {
        return {
          accountId,
          success: false,
          refreshed: false,
          error: '不是OAuth类型账号'
        }
      }

      return await this.checkAndRefreshToken(accountId, account.credentials)

    } catch (error: any) {
      console.error(`手动刷新账号 ${accountId} token失败:`, error)
      
      return {
        accountId,
        success: false,
        refreshed: false,
        error: error.message
      }
    }
  }
}

// 全局实例
let globalTokenManager: OAuthTokenManager | null = null

/**
 * 获取全局OAuth Token管理器实例
 */
export function getOAuthTokenManager(prisma: PrismaClient): OAuthTokenManager {
  if (!globalTokenManager) {
    globalTokenManager = new OAuthTokenManager(prisma)
  }
  return globalTokenManager
}

/**
 * 启动全局OAuth Token自动刷新服务
 */
export function startGlobalTokenRefresh(prisma: PrismaClient): void {
  const manager = getOAuthTokenManager(prisma)
  manager.startAutoRefresh()
}

/**
 * 停止全局OAuth Token自动刷新服务
 */
export function stopGlobalTokenRefresh(): void {
  if (globalTokenManager) {
    globalTokenManager.stopAutoRefresh()
  }
}