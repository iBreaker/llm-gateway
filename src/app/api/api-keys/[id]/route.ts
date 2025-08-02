import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function handleUpdateApiKey(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const apiKeyId = BigInt(params.id)
    const { name, permissions, rateLimits, isActive, expiresAt } = await request.json()

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

    // 检查API Key是否存在且属于当前用户
    const existingApiKey = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: request.user.id
      }
    })

    if (!existingApiKey) {
      return NextResponse.json(
        { message: 'API Key不存在或无权限访问' },
        { status: 404 }
      )
    }

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

    // 更新API Key
    const updatedApiKey = await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: {
        name,
        permissions: JSON.parse(JSON.stringify(permissions)),
        rateLimits: JSON.parse(JSON.stringify(rateLimits)),
        isActive: isActive !== undefined ? isActive : true,
        expiresAt: expirationDate
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
      }
    })

    return NextResponse.json({
      apiKey: {
        id: updatedApiKey.id.toString(),
        name: updatedApiKey.name,
        keyHash: `sk-****${updatedApiKey.keyHash.slice(-8)}`,
        permissions: Array.isArray(updatedApiKey.permissions) ? updatedApiKey.permissions : [],
        rateLimits: typeof updatedApiKey.rateLimits === 'object' ? updatedApiKey.rateLimits : {},
        isActive: updatedApiKey.isActive,
        expiresAt: updatedApiKey.expiresAt?.toISOString() || null,
        lastUsedAt: updatedApiKey.lastUsedAt?.toISOString() || null,
        requestCount: Number(updatedApiKey.requestCount),
        createdAt: updatedApiKey.createdAt.toISOString()
      }
    })

  } catch (error) {
    console.error('更新API Key失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function handleDeleteApiKey(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const apiKeyId = BigInt(params.id)

    // 检查API Key是否存在且属于当前用户
    const existingApiKey = await prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        userId: request.user.id
      }
    })

    if (!existingApiKey) {
      return NextResponse.json(
        { message: 'API Key不存在或无权限访问' },
        { status: 404 }
      )
    }

    // 删除API Key（级联删除相关的使用记录）
    await prisma.apiKey.delete({
      where: { id: apiKeyId }
    })

    return NextResponse.json({
      message: 'API Key删除成功'
    })

  } catch (error) {
    console.error('删除API Key失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const PUT = withAuth(handleUpdateApiKey)
export const DELETE = withAuth(handleDeleteApiKey)