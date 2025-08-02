import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth/jwt'

// 强制动态渲染
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // 提取 Token
    const authHeader = request.headers.get('authorization')
    const token = extractTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        { message: '未提供认证令牌' },
        { status: 401 }
      )
    }

    // 验证 Token
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json(
        { message: '无效的认证令牌' },
        { status: 401 }
      )
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: BigInt(payload.userId) },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    })

    if (!user || !user.isActive) {
      return NextResponse.json(
        { message: '用户不存在或已被禁用' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    })

  } catch (error) {
    console.error('Get user info error:', error)
    return NextResponse.json(
      { message: '服务器错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}