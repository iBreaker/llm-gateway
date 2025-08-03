/**
 * 管理员OAuth token刷新端点
 * 用于手动触发OAuth token刷新
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOAuthTokenManager } from '@/lib/services/oauth-token-manager'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, action } = body

    const tokenManager = getOAuthTokenManager(prisma)

    if (action === 'refresh-all') {
      // 刷新所有OAuth账号的token
      console.log('开始刷新所有OAuth账号的token...')
      const results = await tokenManager.checkAndRefreshAllTokens()
      
      return NextResponse.json({
        success: true,
        message: '批量token刷新完成',
        results: results.map(r => ({
          accountId: r.accountId.toString(),
          success: r.success,
          refreshed: r.refreshed,
          error: r.error,
          oldExpiresAt: r.oldExpiresAt ? new Date(r.oldExpiresAt).toISOString() : undefined,
          newExpiresAt: r.newExpiresAt ? new Date(r.newExpiresAt).toISOString() : undefined
        }))
      })
    } else if (action === 'refresh-single' && accountId) {
      // 刷新单个账号的token
      console.log(`开始刷新账号 ${accountId} 的token...`)
      const result = await tokenManager.refreshTokenForAccount(BigInt(accountId))
      
      return NextResponse.json({
        success: true,
        message: `账号 ${accountId} token刷新完成`,
        result: {
          accountId: result.accountId.toString(),
          success: result.success,
          refreshed: result.refreshed,
          error: result.error,
          oldExpiresAt: result.oldExpiresAt ? new Date(result.oldExpiresAt).toISOString() : undefined,
          newExpiresAt: result.newExpiresAt ? new Date(result.newExpiresAt).toISOString() : undefined
        }
      })
    } else {
      return NextResponse.json({
        success: false,
        error: '无效的操作参数',
        message: '请提供 action: "refresh-all" 或 action: "refresh-single" 与 accountId'
      }, { status: 400 })
    }

  } catch (error: any) {
    console.error('OAuth token刷新失败:', error)
    
    return NextResponse.json({
      success: false,
      error: 'oauth_refresh_failed',
      message: error.message
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // 获取所有OAuth账号的状态
    const oauthAccounts = await prisma.upstreamAccount.findMany({
      where: { type: 'ANTHROPIC_OAUTH' },
      select: {
        id: true,
        name: true,
        status: true,
        credentials: true,
        lastUsedAt: true,
        updatedAt: true
      }
    })

    const accountStatus = oauthAccounts.map(account => {
      const credentials = typeof account.credentials === 'object' 
        ? account.credentials 
        : JSON.parse(account.credentials as string)
      
      const expiresAt = new Date(credentials.expiresAt)
      const now = new Date()
      const timeLeft = expiresAt.getTime() - now.getTime()

      return {
        id: account.id.toString(),
        name: account.name,
        status: account.status,
        expiresAt: expiresAt.toISOString(),
        timeLeftMs: timeLeft,
        timeLeftFormatted: timeLeft > 0 
          ? `${Math.floor(timeLeft / (1000 * 60 * 60))}小时${Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))}分钟`
          : '已过期',
        isExpired: timeLeft <= 0,
        isExpiringSoon: timeLeft > 0 && timeLeft <= 60 * 60 * 1000, // 1小时内
        lastUsedAt: account.lastUsedAt?.toISOString(),
        updatedAt: account.updatedAt.toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      accounts: accountStatus,
      summary: {
        total: accountStatus.length,
        expired: accountStatus.filter(a => a.isExpired).length,
        expiringSoon: accountStatus.filter(a => a.isExpiringSoon).length,
        valid: accountStatus.filter(a => !a.isExpired && !a.isExpiringSoon).length
      }
    })

  } catch (error: any) {
    console.error('获取OAuth账号状态失败:', error)
    
    return NextResponse.json({
      success: false,
      error: 'status_check_failed',
      message: error.message
    }, { status: 500 })
  }
}