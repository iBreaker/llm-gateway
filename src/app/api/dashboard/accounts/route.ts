import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function handleGetAccounts(request: AuthenticatedRequest) {
  try {
    const accounts = await prisma.upstreamAccount.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      accounts: accounts.map(account => ({
        id: account.id.toString(),
        name: account.name,
        type: account.type,
        status: account.status,
        createdAt: account.createdAt.toISOString()
      }))
    })

  } catch (error) {
    console.error('获取账号列表失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const GET = withAuth(handleGetAccounts)