import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { UserService, ServiceError } from '@/lib/services'

async function handleGetUsers(request: AuthenticatedRequest) {
  try {
    // 从查询参数中获取分页和过滤选项
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const role = searchParams.get('role') as any
    const isActive = searchParams.get('isActive')
    const search = searchParams.get('search')

    const result = await UserService.getUsers({
      page,
      pageSize,
      role,
      isActive: isActive === null ? undefined : isActive === 'true',
      search: search || undefined
    })

    return NextResponse.json({
      users: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        hasNext: result.hasNext
      }
    })

  } catch (error) {
    console.error('获取用户列表失败:', error)
    
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

async function handleCreateUser(request: AuthenticatedRequest) {
  try {
    const userData = await request.json()
    const newUser = await UserService.createUser(userData)

    return NextResponse.json({
      user: newUser
    }, { status: 201 })

  } catch (error) {
    console.error('创建用户失败:', error)
    
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

export const GET = withAuth(handleGetUsers, { requiredRoles: ['ADMIN'] })
export const POST = withAuth(handleCreateUser, { requiredRoles: ['ADMIN'] })