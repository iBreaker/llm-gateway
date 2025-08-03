import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { AccountService, ServiceError } from '@/lib/services'
import { prisma } from '@/lib/prisma'

async function handleToggleAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)
    const updatedAccount = await AccountService.toggleAccountStatus(accountId, request.user.id)

    const action = updatedAccount.status === 'ACTIVE' ? '启用' : '禁用'
    console.log(`✅ 账号 ${updatedAccount.name} (ID: ${accountId}) 已${action}`)

    return NextResponse.json({
      message: `账号已${action}`,
      account: updatedAccount
    })

  } catch (error: any) {
    console.error('切换账号状态失败:', error)
    
    if (error instanceof ServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { message: '切换账号状态失败' },
      { status: 500 }
    )
  }
}

async function handleBatchToggle(request: AuthenticatedRequest) {
  try {
    const { accountIds, action } = await request.json()
    
    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json(
        { message: '请提供有效的账号ID列表' },
        { status: 400 }
      )
    }

    if (!['enable', 'disable'].includes(action)) {
      return NextResponse.json(
        { message: '操作类型必须是 enable 或 disable' },
        { status: 400 }
      )
    }

    const bigIntIds = accountIds.map((id: string) => BigInt(id))
    const newStatus = action === 'enable' ? 'ACTIVE' : 'INACTIVE'

    // 检查所有账号是否属于当前用户
    const accounts = await prisma.upstreamAccount.findMany({
      where: {
        id: { in: bigIntIds },
        userId: request.user.id
      },
      select: { id: true, name: true }
    })

    if (accounts.length !== accountIds.length) {
      return NextResponse.json(
        { message: '部分账号不存在或无权限访问' },
        { status: 403 }
      )
    }

    // 批量更新状态
    const result = await prisma.upstreamAccount.updateMany({
      where: {
        id: { in: bigIntIds },
        userId: request.user.id
      },
      data: {
        status: newStatus,
        updatedAt: new Date()
      }
    })

    const actionText = action === 'enable' ? '启用' : '禁用'
    console.log(`✅ 批量${actionText}了 ${result.count} 个账号`)

    return NextResponse.json({
      message: `成功${actionText}了 ${result.count} 个账号`,
      affectedCount: result.count,
      accounts: accounts.map((acc: any) => ({
        id: acc.id.toString(),
        name: acc.name
      }))
    })

  } catch (error: any) {
    console.error('批量切换账号状态失败:', error)
    return NextResponse.json(
      { message: '批量操作失败' },
      { status: 500 }
    )
  } finally {
  }
}

// 单个账号切换
export const PATCH = withAuth(handleToggleAccount, { requiredRoles: ['ADMIN'] })

// 批量操作
export const POST = withAuth(handleBatchToggle, { requiredRoles: ['ADMIN'] })