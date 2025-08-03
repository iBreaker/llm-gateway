import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { AccountService, ServiceError } from '@/lib/services'

async function handleGetAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)
    const account = await AccountService.getAccountById(accountId, request.user.id)

    if (!account) {
      return NextResponse.json(
        { message: '上游账号不存在或无权限访问' },
        { status: 404 }
      )
    }

    return NextResponse.json({ account })

  } catch (error) {
    console.error('获取上游账号失败:', error)
    
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

async function handleUpdateAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)
    const updateData = await request.json()

    const updatedAccount = await AccountService.updateAccount(accountId, request.user.id, updateData)

    return NextResponse.json({
      account: updatedAccount
    })

  } catch (error) {
    console.error('更新上游账号失败:', error)
    
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

async function handleDeleteAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)

    await AccountService.deleteAccount(accountId, request.user.id)

    return NextResponse.json({
      message: '上游账号删除成功'
    })

  } catch (error) {
    console.error('删除上游账号失败:', error)
    
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


export const GET = withAuth(handleGetAccount, { requiredRoles: ['ADMIN'] })
export const PUT = withAuth(handleUpdateAccount, { requiredRoles: ['ADMIN'] })
export const DELETE = withAuth(handleDeleteAccount, { requiredRoles: ['ADMIN'] })