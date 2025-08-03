import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AnthropicClient } from '@/lib/anthropic/client'
import { AnthropicOAuthClient, validateAnthropicOAuthCredentials, type AnthropicOAuthCredentials } from '@/lib/anthropic-oauth/client'

async function handleHealthCheck(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)

    // 检查账号是否存在且属于当前用户
    const account = await prisma.upstreamAccount.findFirst({
      where: {
        id: accountId,
        userId: request.user.id
      }
    })

    if (!account) {
      return NextResponse.json(
        { message: '上游账号不存在或无权限访问' },
        { status: 404 }
      )
    }

    // 执行健康检查
    const result = await performHealthCheck(account)

    return NextResponse.json({
      message: '健康检查完成',
      healthStatus: result
    })

  } catch (error) {
    console.error('健康检查失败:', error)
    return NextResponse.json(
      { message: '健康检查失败' },
      { status: 500 }
    )
  } finally {
  }
}

/**
 * 执行健康检查
 */
async function performHealthCheck(account: any) {
  try {
    const startTime = Date.now()
    
    let healthStatus: any = {
      status: 'unknown',
      lastCheck: new Date().toISOString()
    }

    if (account.type === 'ANTHROPIC_API') {
      const credentials = typeof account.credentials === 'string' 
        ? JSON.parse(account.credentials) 
        : account.credentials

      if (!credentials.api_key) {
        throw new Error('缺少API Key')
      }

      const client = new AnthropicClient(credentials.api_key, credentials.base_url)
      
      console.log(`开始检查账号 ${account.id} (${account.name}) 的健康状态...`)
      
      // 使用 validateApiKey 方法，它能处理代理服务器的响应头问题
      const validationResult = await client.validateApiKey()
      const responseTime = Date.now() - startTime

      console.log(`账号 ${account.id} 验证结果:`, validationResult)
      console.log(`响应时间: ${responseTime}ms`)

      if (validationResult.valid) {
        healthStatus = {
          status: 'success',
          responseTime,
          lastCheck: new Date().toISOString(),
          message: validationResult.error || 'API Key验证成功'
        }
        console.log(`账号 ${account.id} 健康检查成功`)
      } else {
        console.error(`账号 ${account.id} 健康检查失败: ${validationResult.error}`)
        if (validationResult.details) {
          console.error('错误详情:', validationResult.details)
        }
        throw new Error(validationResult.error || 'API Key验证失败')
      }

      // 更新数据库中的健康状态
      await prisma.upstreamAccount.update({
        where: { id: account.id },
        data: {
          status: 'ACTIVE',
          lastHealthCheck: new Date(),
          healthStatus: JSON.parse(JSON.stringify(healthStatus))
        }
      })

    } else if (account.type === 'ANTHROPIC_OAUTH') {
      const credentials = typeof account.credentials === 'string' 
        ? JSON.parse(account.credentials) 
        : account.credentials

      // 验证凭据格式
      const credentialsValidation = validateAnthropicOAuthCredentials(credentials)
      if (!credentialsValidation.valid) {
        throw new Error(`凭据格式错误: ${credentialsValidation.error}`)
      }

      const client = new AnthropicOAuthClient(credentials as AnthropicOAuthCredentials)
      
      console.log(`开始检查Anthropic OAuth账号 ${account.id} (${account.name}) 的健康状态...`)
      
      const validationResult = await client.validateCredentials()
      const responseTime = Date.now() - startTime

      console.log(`Claude Code账号 ${account.id} 验证结果:`, validationResult)
      console.log(`响应时间: ${responseTime}ms`)

      if (validationResult.valid) {
        const timeToExpiry = client.getFormattedTimeToExpiry()
        const isExpiringSoon = client.isTokenExpiringSoon()
        
        healthStatus = {
          status: 'success',
          responseTime,
          lastCheck: new Date().toISOString(),
          message: '访问令牌验证成功',
          tokenInfo: {
            timeToExpiry,
            isExpiringSoon,
            expiresAt: new Date(credentials.expiresAt).toISOString()
          },
          userInfo: validationResult.userInfo
        }
        
        if (isExpiringSoon) {
          healthStatus.message += ' (令牌即将过期，建议刷新)'
        }
        
        console.log(`Claude Code账号 ${account.id} 健康检查成功`)
      } else {
        console.error(`Claude Code账号 ${account.id} 健康检查失败: ${validationResult.error}`)
        if (validationResult.details) {
          console.error('错误详情:', validationResult.details)
        }
        throw new Error(validationResult.error || '访问令牌验证失败')
      }

      // 更新数据库中的健康状态
      await prisma.upstreamAccount.update({
        where: { id: account.id },
        data: {
          status: 'ACTIVE',
          lastHealthCheck: new Date(),
          healthStatus: JSON.parse(JSON.stringify(healthStatus))
        }
      })

    } else {
      // 对于其他类型的账号，暂时标记为未检查
      healthStatus = {
        status: 'not_implemented',
        message: '该账号类型暂不支持健康检查',
        lastCheck: new Date().toISOString()
      }

      await prisma.upstreamAccount.update({
        where: { id: account.id },
        data: {
          lastHealthCheck: new Date(),
          healthStatus: JSON.parse(JSON.stringify(healthStatus))
        }
      })
    }

    return healthStatus

  } catch (error: any) {
    console.error(`账号 ${account.id} 健康检查失败:`, error)
    
    const errorStatus = {
      status: 'error',
      error: error.message,
      lastCheck: new Date().toISOString(),
      details: error.details || null
    }

    // 更新数据库中的错误状态
    await prisma.upstreamAccount.update({
      where: { id: account.id },
      data: {
        lastHealthCheck: new Date(),
        status: 'ERROR',
        healthStatus: JSON.parse(JSON.stringify(errorStatus))
      }
    })

    return errorStatus
  }
}

export const POST = withAuth(handleHealthCheck, { requiredRoles: ['ADMIN'] })