import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function handleToggleAccount(request: AuthenticatedRequest, { params }: { params: { id: string } }) {
  try {
    const accountId = BigInt(params.id)

    // 检查账号是否存在且属于当前用户
    const account = await prisma.upstreamAccount.findFirst({
      where: {
        id: accountId,
        userId: request.user.id
      }
    })

    if (!account) {
      return NextResponse.json(
        { message: '上游账号不存在或无权限访问' },
        { status: 404 }
      )
    }

    // 切换账号状态
    const newStatus = account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    
    const updatedAccount = await prisma.upstreamAccount.update({
      where: { id: accountId },
      data: {
        status: newStatus,
        updatedAt: new Date()
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        priority: true,
        weight: true,
        lastHealthCheck: true,
        createdAt: true,
        updatedAt: true
      }
    })

    const action = newStatus === 'ACTIVE' ? '启用' : '禁用'
    console.log(`✅ 账号 ${account.name} (ID: ${accountId}) 已${action}`)

    return NextResponse.json({
      message: `账号已${action}`,
      account: {
        ...updatedAccount,
        id: updatedAccount.id.toString()
      }
    })

  } catch (error: any) {
    console.error('切换账号状态失败:', error)
    return NextResponse.json(
      { message: '切换账号状态失败' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
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
      accounts: accounts.map(acc => ({
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
    await prisma.$disconnect()
  }
}

// 单个账号切换
export const PATCH = withAuth(handleToggleAccount, { requiredRoles: ['ADMIN'] })

// 批量操作
export const POST = withAuth(handleBatchToggle, { requiredRoles: ['ADMIN'] })