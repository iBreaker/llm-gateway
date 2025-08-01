import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

// DELETE /api/dashboard/accounts/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDatabase()
    const accountId = params.id

    // 检查账号是否存在
    const account = await db.findOne('upstream_accounts', { id: parseInt(accountId) })
    if (!account) {
      return NextResponse.json(
        { error: '账号不存在' },
        { status: 404 }
      )
    }

    // 删除账号
    await db.delete('upstream_accounts', { id: parseInt(accountId) })

    return NextResponse.json({ success: true })
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

// PUT /api/dashboard/accounts/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDatabase()
    const accountId = params.id
    const body = await request.json()

    // 验证必填字段
    if (!body.email || !body.type) {
      return NextResponse.json(
        { error: '邮箱和类型为必填字段' },
        { status: 400 }
      )
    }

    // 检查账号是否存在
    const account = await db.findOne('upstream_accounts', { id: parseInt(accountId) })
    if (!account) {
      return NextResponse.json(
        { error: '账号不存在' },
        { status: 404 }
      )
    }

    // 更新账号
    const updateData: any = {
      email: body.email,
      type: body.type,
      is_active: body.is_active !== undefined ? body.is_active : true,
      priority: body.priority || 1,
      weight: body.weight || 100,
      updated_at: new Date().toISOString()
    }

    if (body.credentials) {
      updateData.credentials = JSON.stringify(body.credentials)
    }

    await db.update('upstream_accounts', { id: parseInt(accountId) }, updateData)

    // 返回更新后的账号
    const updatedAccount = await db.findOne('upstream_accounts', { id: parseInt(accountId) })

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