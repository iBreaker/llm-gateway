import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

async function handleGetUsers(request: AuthenticatedRequest) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      users: users.map(user => ({
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: null // 暂时设为null，后续可以添加登录日志功能
      }))
    })

  } catch (error) {
    console.error('获取用户列表失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
  }
}

async function handleCreateUser(request: AuthenticatedRequest) {
  try {
    const { email, username, password, role } = await request.json()

    // 验证必填字段
    if (!email || !username || !password || !role) {
      return NextResponse.json(
        { message: '邮箱、用户名、密码和角色为必填项' },
        { status: 400 }
      )
    }

    // 验证角色有效性
    if (!['ADMIN', 'USER', 'READONLY'].includes(role)) {
      return NextResponse.json(
        { message: '无效的用户角色' },
        { status: 400 }
      )
    }

    // 检查邮箱和用户名是否已存在
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    })

    if (existingUser) {
      return NextResponse.json(
        { message: '邮箱或用户名已存在' },
        { status: 409 }
      )
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 10)

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role,
        isActive: true
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    })

    return NextResponse.json({
      user: {
        id: user.id.toString(),
        email: user.email,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString()
      }
    }, { status: 201 })

  } catch (error) {
    console.error('创建用户失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
  }
}

export const GET = withAuth(handleGetUsers, { requiredRoles: ['ADMIN'] })
export const POST = withAuth(handleCreateUser, { requiredRoles: ['ADMIN'] })