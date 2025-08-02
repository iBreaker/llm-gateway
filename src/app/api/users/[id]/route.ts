import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

async function handleUpdateUser(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const userId = BigInt(params.id)
    const { email, username, role, isActive, password } = await request.json()

    // 验证必填字段
    if (!email || !username || !role || isActive === undefined) {
      return NextResponse.json(
        { message: '邮箱、用户名、角色和状态为必填项' },
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

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!existingUser) {
      return NextResponse.json(
        { message: '用户不存在' },
        { status: 404 }
      )
    }

    // 检查邮箱和用户名是否被其他用户使用
    const conflictUser = await prisma.user.findFirst({
      where: {
        AND: [
          { id: { not: userId } },
          {
            OR: [
              { email },
              { username }
            ]
          }
        ]
      }
    })

    if (conflictUser) {
      return NextResponse.json(
        { message: '邮箱或用户名已被其他用户使用' },
        { status: 409 }
      )
    }

    // 准备更新数据
    const updateData: any = {
      email,
      username,
      role,
      isActive
    }

    // 如果提供了新密码，则更新密码
    if (password && password.trim()) {
      updateData.passwordHash = await bcrypt.hash(password, 10)
    }

    // 更新用户
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return NextResponse.json({
      user: {
        id: updatedUser.id.toString(),
        email: updatedUser.email,
        username: updatedUser.username,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        createdAt: updatedUser.createdAt.toISOString(),
        lastLoginAt: null
      }
    })

  } catch (error) {
    console.error('更新用户失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function handleDeleteUser(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const userId = BigInt(params.id)

    // 检查用户是否存在
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!existingUser) {
      return NextResponse.json(
        { message: '用户不存在' },
        { status: 404 }
      )
    }

    // 防止删除当前登录用户
    if (userId === request.user.id) {
      return NextResponse.json(
        { message: '不能删除当前登录用户' },
        { status: 400 }
      )
    }

    // 检查是否是最后一个管理员
    if (existingUser.role === 'ADMIN') {
      const adminCount = await prisma.user.count({
        where: { role: 'ADMIN' }
      })

      if (adminCount <= 1) {
        return NextResponse.json(
          { message: '不能删除最后一个管理员用户' },
          { status: 400 }
        )
      }
    }

    // 删除用户（级联删除相关的API Keys等）
    await prisma.user.delete({
      where: { id: userId }
    })

    return NextResponse.json({
      message: '用户删除成功'
    })

  } catch (error) {
    console.error('删除用户失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

export const PUT = withAuth(handleUpdateUser, { requiredRoles: ['ADMIN'] })
export const DELETE = withAuth(handleDeleteUser, { requiredRoles: ['ADMIN'] })