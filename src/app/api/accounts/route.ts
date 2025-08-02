import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'
import { AnthropicClient } from '@/lib/anthropic/client'

const prisma = new PrismaClient()

async function handleGetAccounts(request: AuthenticatedRequest) {
  try {
    const accounts = await prisma.upstreamAccount.findMany({
      where: {
        userId: request.user.id
      },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        status: true,
        priority: true,
        weight: true,
        lastHealthCheck: true,
        healthStatus: true,
        lastUsedAt: true,
        requestCount: true,
        successCount: true,
        errorCount: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    return NextResponse.json({
      accounts: accounts.map(account => ({
        id: account.id.toString(),
        name: account.name,
        type: account.type,
        email: account.email,
        status: account.status,
        priority: account.priority,
        weight: account.weight,
        lastHealthCheck: account.lastHealthCheck?.toISOString() || null,
        healthStatus: typeof account.healthStatus === 'object' ? account.healthStatus : {},
        lastUsedAt: account.lastUsedAt?.toISOString() || null,
        requestCount: Number(account.requestCount),
        successCount: Number(account.successCount),
        errorCount: Number(account.errorCount),
        createdAt: account.createdAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('获取上游账号失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function handleCreateAccount(request: AuthenticatedRequest) {
  try {
    const { name, type, email, credentials, config, priority, weight } = await request.json()

    // 验证必填字段
    if (!name || !type || !credentials) {
      return NextResponse.json(
        { message: '名称、类型和凭据为必填项' },
        { status: 400 }
      )
    }

    // 对于非 ANTHROPIC_API 类型，邮箱是必填的
    if (type !== 'ANTHROPIC_API' && !email) {
      return NextResponse.json(
        { message: '邮箱为必填项' },
        { status: 400 }
      )
    }

    // 验证账号类型
    const validTypes = ['ANTHROPIC_API', 'CLAUDE_CODE', 'GEMINI_CLI', 'OPENAI_API']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { message: '无效的账号类型' },
        { status: 400 }
      )
    }

    // 验证Anthropic API凭据
    if (type === 'ANTHROPIC_API') {
      if (!credentials.api_key) {
        return NextResponse.json(
          { message: 'Anthropic API Key为必填项' },
          { status: 400 }
        )
      }

      if (!credentials.base_url) {
        return NextResponse.json(
          { message: 'Base URL为必填项' },
          { status: 400 }
        )
      }

      // 验证API Key有效性
      try {
        const client = new AnthropicClient(credentials.api_key, credentials.base_url)
        const validationResult = await client.validateApiKey()
        if (!validationResult.valid) {
          console.error('验证Anthropic API Key失败:', validationResult.error)
          if (validationResult.details) {
            console.error('验证错误详情:', validationResult.details)
          }
          return NextResponse.json(
            { message: validationResult.error || 'Anthropic API Key无效或已过期' },
            { status: 400 }
          )
        }
      } catch (error) {
        console.error('验证Anthropic API Key失败:', error)
        return NextResponse.json(
          { message: 'API Key验证失败' },
          { status: 400 }
        )
      }
    }

    // 对于需要邮箱的类型，检查邮箱是否已存在
    if (email) {
      const existingAccount = await prisma.upstreamAccount.findFirst({
        where: {
          userId: request.user.id,
          email
        }
      })

      if (existingAccount) {
        return NextResponse.json(
          { message: '该邮箱已存在上游账号' },
          { status: 409 }
        )
      }
    }

    // 创建上游账号
    const account = await prisma.upstreamAccount.create({
      data: {
        name,
        type,
        email: email || null,
        credentials: JSON.parse(JSON.stringify(credentials)),
        config: JSON.parse(JSON.stringify(config || {})),
        status: 'ACTIVE',
        priority: priority || 1,
        weight: weight || 100,
        healthStatus: JSON.parse(JSON.stringify({})),
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        user: {
          connect: {
            id: request.user.id
          }
        }
      },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        status: true,
        priority: true,
        weight: true,
        createdAt: true
      }
    })

    // 执行初始健康检查
    if (type === 'ANTHROPIC_API') {
      performHealthCheck(account.id, credentials.api_key, credentials.base_url)
    }

    return NextResponse.json({
      account: {
        id: account.id.toString(),
        name: account.name,
        type: account.type,
        email: account.email,
        status: account.status,
        priority: account.priority,
        weight: account.weight,
        createdAt: account.createdAt.toISOString()
      }
    }, { status: 201 })

  } catch (error) {
    console.error('创建上游账号失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * 执行健康检查（异步）
 */
async function performHealthCheck(accountId: bigint, apiKey: string, baseUrl?: string) {
  try {
    console.log(`开始检查账号 ${accountId} 的健康状态...`)
    const startTime = Date.now()
    const client = new AnthropicClient(apiKey, baseUrl)
    
    // 使用 validateApiKey 方法，它能处理代理服务器的响应头问题
    const validationResult = await client.validateApiKey()
    const responseTime = Date.now() - startTime

    console.log(`账号 ${accountId} 验证结果:`, validationResult)
    console.log(`响应时间: ${responseTime}ms`)

    if (validationResult.valid) {
      // 更新健康状态
      await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: {
          status: 'ACTIVE',
          lastHealthCheck: new Date(),
          healthStatus: JSON.parse(JSON.stringify({
            status: 'success',
            responseTime,
            lastCheck: new Date().toISOString(),
            message: validationResult.error || 'API Key验证成功'
          }))
        }
      })
      console.log(`账号 ${accountId} 健康检查成功`)
    } else {
      throw new Error(validationResult.error || 'API Key验证失败')
    }

  } catch (error: any) {
    console.error(`账号 ${accountId} 健康检查失败:`, error)
    
    // 更新错误状态
    await prisma.upstreamAccount.update({
      where: { id: accountId },
      data: {
        lastHealthCheck: new Date(),
        status: 'ERROR',
        healthStatus: JSON.parse(JSON.stringify({
          status: 'error',
          error: error.message,
          lastCheck: new Date().toISOString(),
          details: error.details || null
        }))
      }
    })
  } finally {
    await prisma.$disconnect()
  }
}

export const GET = withAuth(handleGetAccounts, { requiredRoles: ['ADMIN'] })
export const POST = withAuth(handleCreateAccount, { requiredRoles: ['ADMIN'] })