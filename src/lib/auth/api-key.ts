import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export interface ApiKeyAuthRequest extends NextRequest {
  apiKey?: {
    id: bigint
    userId: bigint
    name: string
    permissions: string[]
    rateLimits: {
      per_minute?: number
      per_hour?: number
    }
    isActive: boolean
    expiresAt: Date | null
  }
}

/**
 * 验证API Key的中间件
 */
export async function validateApiKey(request: NextRequest): Promise<{ 
  success: boolean
  apiKey?: any
  error?: string 
}> {
  try {
    // 从请求头中提取API Key (支持Anthropic格式的x-api-key)
    const authHeader = request.headers.get('authorization')
    const xApiKey = request.headers.get('x-api-key')
    const apiKeyFromHeader = extractApiKeyFromHeader(authHeader) || xApiKey
    
    if (!apiKeyFromHeader) {
      return { success: false, error: '未提供API Key' }
    }

    // 查找匹配的API Key
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            isActive: true
          }
        }
      }
    })

    let matchedApiKey = null
    for (const dbApiKey of apiKeys) {
      const isMatch = await bcrypt.compare(apiKeyFromHeader, dbApiKey.keyHash)
      if (isMatch) {
        matchedApiKey = dbApiKey
        break
      }
    }

    if (!matchedApiKey) {
      return { success: false, error: '无效的API Key' }
    }

    // 检查API Key是否过期
    if (matchedApiKey.expiresAt && new Date() > matchedApiKey.expiresAt) {
      return { success: false, error: 'API Key已过期' }
    }

    // 检查用户是否激活
    if (!matchedApiKey.user.isActive) {
      return { success: false, error: '用户账户已禁用' }
    }

    // 更新最后使用时间和请求计数
    await prisma.apiKey.update({
      where: { id: matchedApiKey.id },
      data: {
        lastUsedAt: new Date(),
        requestCount: {
          increment: 1
        }
      }
    })

    return {
      success: true,
      apiKey: {
        id: matchedApiKey.id,
        userId: matchedApiKey.userId,
        name: matchedApiKey.name,
        permissions: Array.isArray(matchedApiKey.permissions) ? matchedApiKey.permissions : [],
        rateLimits: typeof matchedApiKey.rateLimits === 'object' ? matchedApiKey.rateLimits : {},
        isActive: matchedApiKey.isActive,
        expiresAt: matchedApiKey.expiresAt
      }
    }

  } catch (error) {
    console.error('API Key验证失败:', error)
    return { success: false, error: '服务器内部错误' }
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * 检查API Key是否有指定权限
 */
export function hasPermission(apiKey: any, requiredPermission: string): boolean {
  if (!apiKey || !apiKey.permissions) {
    return false
  }

  // admin权限可以访问所有资源
  if (apiKey.permissions.includes('admin')) {
    return true
  }

  return apiKey.permissions.includes(requiredPermission)
}

/**
 * 从请求头中提取API Key
 */
function extractApiKeyFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null
  }

  // 支持 Bearer token 格式
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // 支持直接的API Key格式
  if (authHeader.startsWith('sk-')) {
    return authHeader
  }

  return null
}

/**
 * 创建需要API Key验证的路由处理器
 */
export function withApiKey(
  handler: (request: ApiKeyAuthRequest) => Promise<NextResponse>,
  options: { requiredPermission?: string } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // 验证API Key
    const validation = await validateApiKey(request)
    
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 401 }
      )
    }

    // 检查权限
    if (options.requiredPermission && !hasPermission(validation.apiKey, options.requiredPermission)) {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    // 将API Key信息添加到请求中
    ;(request as ApiKeyAuthRequest).apiKey = validation.apiKey

    // 执行实际的处理函数
    return handler(request as ApiKeyAuthRequest)
  }
}

/**
 * 记录API使用记录
 */
export async function recordUsage(
  apiKeyId: bigint,
  upstreamAccountId: bigint | null,
  requestData: {
    requestId: string
    method: string
    endpoint: string
    model?: string  // 添加模型字段
    statusCode?: number
    responseTime?: number
    tokensUsed?: number
    cost?: number
    errorMessage?: string
    userAgent?: string
    clientIp?: string
  }
) {
  try {
    await prisma.usageRecord.create({
      data: {
        apiKeyId,
        upstreamAccountId,
        requestId: requestData.requestId,
        method: requestData.method,
        endpoint: requestData.endpoint,
        model: requestData.model,  // 添加模型字段到数据库
        statusCode: requestData.statusCode,
        responseTime: requestData.responseTime,
        tokensUsed: BigInt(requestData.tokensUsed || 0),
        cost: requestData.cost || 0,
        errorMessage: requestData.errorMessage,
        userAgent: requestData.userAgent,
        clientIp: requestData.clientIp
      }
    })
  } catch (error) {
    console.error('记录使用记录失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}