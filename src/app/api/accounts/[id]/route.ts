import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AnthropicClient } from '@/lib/anthropic/client'

async function handleUpdateAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)
    const { name, email, credentials, config, priority, weight, status } = await request.json()

    // 检查账号是否存在且属于当前用户
    const existingAccount = await prisma.upstreamAccount.findFirst({
      where: {
        id: accountId,
        userId: request.user.id
      }
    })

    if (!existingAccount) {
      return NextResponse.json(
        { message: '上游账号不存在或无权限访问' },
        { status: 404 }
      )
    }

    // 验证必填字段
    if (!name) {
      return NextResponse.json(
        { message: '名称为必填项' },
        { status: 400 }
      )
    }

    // 对于非 ANTHROPIC_API 类型，邮箱是必填的
    if (existingAccount.type !== 'ANTHROPIC_API' && !email) {
      return NextResponse.json(
        { message: '邮箱为必填项' },
        { status: 400 }
      )
    }

    // 对于有邮箱的账号类型，检查邮箱是否被其他账号使用
    if (email) {
      const conflictAccount = await prisma.upstreamAccount.findFirst({
        where: {
          AND: [
            { id: { not: accountId } },
            { userId: request.user.id },
            { email }
          ]
        }
      })

      if (conflictAccount) {
        return NextResponse.json(
          { message: '该邮箱已被其他上游账号使用' },
          { status: 409 }
        )
      }
    }

    // 准备更新数据
    const updateData: any = {
      name,
      email: email || existingAccount.email,
      priority: priority || existingAccount.priority,
      weight: weight || existingAccount.weight,
      status: status || existingAccount.status
    }

    // 如果提供了新凭据，则更新凭据
    if (credentials) {
      // 验证Anthropic API凭据
      if (existingAccount.type === 'ANTHROPIC_API' && credentials.api_key) {

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

      updateData.credentials = JSON.parse(JSON.stringify(credentials))
    }

    // 如果提供了新配置，则更新配置
    if (config) {
      updateData.config = JSON.parse(JSON.stringify(config))
    }

    // 更新上游账号
    const updatedAccount = await prisma.upstreamAccount.update({
      where: { id: accountId },
      data: updateData,
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
      }
    })

    // 如果更新了Anthropic API凭据，执行健康检查
    if (existingAccount.type === 'ANTHROPIC_API' && credentials?.api_key) {
      performHealthCheck(accountId, credentials.api_key, credentials.base_url)
    }

    return NextResponse.json({
      account: {
        id: updatedAccount.id.toString(),
        name: updatedAccount.name,
        type: updatedAccount.type,
        email: updatedAccount.email,
        status: updatedAccount.status,
        priority: updatedAccount.priority,
        weight: updatedAccount.weight,
        lastHealthCheck: updatedAccount.lastHealthCheck?.toISOString() || null,
        healthStatus: typeof updatedAccount.healthStatus === 'object' ? updatedAccount.healthStatus : {},
        lastUsedAt: updatedAccount.lastUsedAt?.toISOString() || null,
        requestCount: Number(updatedAccount.requestCount),
        successCount: Number(updatedAccount.successCount),
        errorCount: Number(updatedAccount.errorCount),
        createdAt: updatedAccount.createdAt.toISOString()
      }
    })

  } catch (error) {
    console.error('更新上游账号失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
  }
}

async function handleDeleteAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)

    // 检查账号是否存在且属于当前用户
    const existingAccount = await prisma.upstreamAccount.findFirst({
      where: {
        id: accountId,
        userId: request.user.id
      }
    })

    if (!existingAccount) {
      return NextResponse.json(
        { message: '上游账号不存在或无权限访问' },
        { status: 404 }
      )
    }

    // 检查是否有正在使用的API Key依赖此账号
    const activeUsage = await prisma.usageRecord.count({
      where: {
        upstreamAccountId: accountId,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时
        }
      }
    })

    if (activeUsage > 0) {
      return NextResponse.json(
        { message: '该账号在最近24小时内有使用记录，无法删除' },
        { status: 400 }
      )
    }

    // 删除上游账号（级联删除相关的使用记录和健康检查记录）
    await prisma.upstreamAccount.delete({
      where: { id: accountId }
    })

    return NextResponse.json({
      message: '上游账号删除成功'
    })

  } catch (error) {
    console.error('删除上游账号失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
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
  }
}

export const PUT = withAuth(handleUpdateAccount, { requiredRoles: ['ADMIN'] })
export const DELETE = withAuth(handleDeleteAccount, { requiredRoles: ['ADMIN'] })