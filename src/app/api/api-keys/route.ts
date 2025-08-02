import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'
import { nanoid } from 'nanoid'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function handleGetApiKeys(request: AuthenticatedRequest) {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: request.user.id
      },
      select: {
        id: true,
        name: true,
        keyHash: true,
        permissions: true,
        rateLimits: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        requestCount: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      apiKeys: apiKeys.map(apiKey => ({
        id: apiKey.id.toString(),
        name: apiKey.name,
        keyHash: `sk-****${apiKey.keyHash.slice(-8)}`, // 只显示后8位
        permissions: Array.isArray(apiKey.permissions) ? apiKey.permissions : [],
        rateLimits: typeof apiKey.rateLimits === 'object' ? apiKey.rateLimits : {},
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt?.toISOString() || null,
        lastUsedAt: apiKey.lastUsedAt?.toISOString() || null,
        requestCount: Number(apiKey.requestCount),
        createdAt: apiKey.createdAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('获取API Keys失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function handleCreateApiKey(request: AuthenticatedRequest) {
  try {
    const { name, permissions, rateLimits, expiresAt } = await request.json()

    // 验证必填字段
    if (!name || !permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json(
        { message: '名称和权限为必填项' },
        { status: 400 }
      )
    }

    // 验证权限
    const validPermissions = ['anthropic.messages', 'openai.chat', 'google.generate', 'admin']
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p))
    if (invalidPermissions.length > 0) {
      return NextResponse.json(
        { message: `无效的权限: ${invalidPermissions.join(', ')}` },
        { status: 400 }
      )
    }

    // 验证限流设置
    if (!rateLimits || typeof rateLimits !== 'object') {
      return NextResponse.json(
        { message: '限流设置为必填项' },
        { status: 400 }
      )
    }

    if (!rateLimits.per_minute || !rateLimits.per_hour) {
      return NextResponse.json(
        { message: '每分钟和每小时限制为必填项' },
        { status: 400 }
      )
    }

    // 生成API Key
    const plainKey = `sk-${nanoid(48)}` // 生成类似 sk-xxx 格式的密钥
    const keyHash = await bcrypt.hash(plainKey, 10)

    // 处理过期时间
    let expirationDate = null
    if (expiresAt) {
      expirationDate = new Date(expiresAt)
      if (expirationDate <= new Date()) {
        return NextResponse.json(
          { message: '过期时间必须在未来' },
          { status: 400 }
        )
      }
    }

    // 创建API Key
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: request.user.id,
        name,
        keyHash,
        permissions: JSON.parse(JSON.stringify(permissions)),
        rateLimits: JSON.parse(JSON.stringify(rateLimits)),
        isActive: true,
        expiresAt: expirationDate,
        requestCount: 0
      },
      select: {
        id: true,
        name: true,
        permissions: true,
        rateLimits: true,
        isActive: true,
        expiresAt: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      apiKey: {
        id: apiKey.id.toString(),
        name: apiKey.name,
        permissions: Array.isArray(apiKey.permissions) ? apiKey.permissions : [],
        rateLimits: typeof apiKey.rateLimits === 'object' ? apiKey.rateLimits : {},
        isActive: apiKey.isActive,
        expiresAt: apiKey.expiresAt?.toISOString() || null,
        createdAt: apiKey.createdAt.toISOString()
      },
      plainKey // 返回明文密钥，仅此一次
    }, { status: 201 })

  } catch (error) {
    console.error('创建API Key失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const GET = withAuth(handleGetApiKeys)
export const POST = withAuth(handleCreateApiKey)