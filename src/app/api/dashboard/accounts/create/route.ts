import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

// POST /api/dashboard/accounts/create
export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase()
    const body = await request.json()

    // 验证必填字段
    if (!body.email || !body.type || !body.credentials) {
      return NextResponse.json(
        { error: '邮箱、类型和凭据为必填字段' },
        { status: 400 }
      )
    }

    // 检查邮箱是否已存在
    const existingAccount = await db.findOne('upstream_accounts', { email: body.email })
    if (existingAccount) {
      return NextResponse.json(
        { error: '该邮箱已被使用' },
        { status: 400 }
      )
    }

    // 创建新账号
    const accountData = {
      type: body.type,
      email: body.email,
      credentials: JSON.stringify(body.credentials),
      is_active: body.is_active !== undefined ? body.is_active : true,
      priority: body.priority || 1,
      weight: body.weight || 100,
      request_count: 0,
      success_count: 0,
      error_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const newAccount = await db.create('upstream_accounts', accountData)

    return NextResponse.json({
      success: true,
      account: newAccount
    })
  } catch (error) {
    console.error('创建账号失败:', error)
    
    return NextResponse.json({
      error: '创建账号失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}