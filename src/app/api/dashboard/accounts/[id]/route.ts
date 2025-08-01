import { NextRequest, NextResponse } from 'next/server'
import { accountManager } from '@/lib/services/account-manager'

// DELETE /api/dashboard/accounts/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = parseInt(params.id)
    
    if (isNaN(accountId)) {
      return NextResponse.json(
        { error: '无效的账号ID' },
        { status: 400 }
      )
    }

    // 检查账号是否存在
    const account = await accountManager.getAccount(accountId)
    if (!account) {
      return NextResponse.json(
        { error: '账号不存在' },
        { status: 404 }
      )
    }

    // 删除账号
    const success = await accountManager.deleteAccount(accountId)
    
    if (success) {
      return NextResponse.json({
        success: true,
        message: '账号删除成功'
      })
    } else {
      return NextResponse.json(
        { error: '删除账号失败' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('删除账号失败:', error)
    
    return NextResponse.json({
      error: '删除账号失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}

// GET /api/dashboard/accounts/[id] - 获取单个账号信息
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = parseInt(params.id)
    
    if (isNaN(accountId)) {
      return NextResponse.json(
        { error: '无效的账号ID' },
        { status: 400 }
      )
    }

    const account = await accountManager.getAccount(accountId)
    
    if (!account) {
      return NextResponse.json(
        { error: '账号不存在' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      account
    })
  } catch (error) {
    console.error('获取账号信息失败:', error)
    
    return NextResponse.json({
      error: '获取账号信息失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}

// PUT /api/dashboard/accounts/[id] - 更新账号信息
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const accountId = parseInt(params.id)
    const body = await request.json()
    
    if (isNaN(accountId)) {
      return NextResponse.json(
        { error: '无效的账号ID' },
        { status: 400 }
      )
    }

    // 检查账号是否存在
    const existingAccount = await accountManager.getAccount(accountId)
    if (!existingAccount) {
      return NextResponse.json(
        { error: '账号不存在' },
        { status: 404 }
      )
    }

    // 更新账号
    const updatedAccount = await accountManager.updateAccount(accountId, body)

    return NextResponse.json({
      success: true,
      account: updatedAccount
    })
  } catch (error) {
    console.error('更新账号失败:', error)
    
    return NextResponse.json({
      error: '更新账号失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}