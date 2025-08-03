import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { UserService, ServiceError } from '@/lib/services'

async function handleGetUser(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const userId = BigInt(params.id)
    const user = await UserService.getUserById(userId)

    if (!user) {
      return NextResponse.json(
        { message: '用户不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user })

  } catch (error) {
    console.error('获取用户信息失败:', error)
    
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

async function handleUpdateUser(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const userId = BigInt(params.id)
    const updateData = await request.json()

    const updatedUser = await UserService.updateUser(userId, updateData)

    return NextResponse.json({
      user: updatedUser
    })

  } catch (error) {
    console.error('更新用户失败:', error)
    
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

async function handleDeleteUser(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const userId = BigInt(params.id)

    // 防止删除当前登录用户
    if (userId === request.user.id) {
      return NextResponse.json(
        { message: '不能删除当前登录用户' },
        { status: 400 }
      )
    }

    // 检查是否是最后一个管理员（这个逻辑应该移到服务层）
    const user = await UserService.getUserById(userId)
    if (user?.role === 'ADMIN') {
      const stats = await UserService.getUserStats()
      if (stats.adminUsers <= 1) {
        return NextResponse.json(
          { message: '不能删除最后一个管理员用户' },
          { status: 400 }
        )
      }
    }

    await UserService.deleteUser(userId)

    return NextResponse.json({
      message: '用户删除成功'
    })

  } catch (error) {
    console.error('删除用户失败:', error)
    
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetUser, { requiredRoles: ['ADMIN'] })
export const PUT = withAuth(handleUpdateUser, { requiredRoles: ['ADMIN'] })
export const DELETE = withAuth(handleDeleteUser, { requiredRoles: ['ADMIN'] })