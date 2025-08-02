import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function handleGetApiKeys(request: AuthenticatedRequest) {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        keyHash: true,
        permissions: true,
        lastUsedAt: true,
        isActive: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      apiKeys: apiKeys.map(apiKey => ({
        id: apiKey.id.toString(),
        name: apiKey.name,
        keyPreview: `sk-...${apiKey.keyHash.slice(-8)}`,
        permissions: apiKey.permissions,
        lastUsed: apiKey.lastUsedAt?.toISOString() || null,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('获取 API Keys 失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const GET = withAuth(handleGetApiKeys)