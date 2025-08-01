import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

// DELETE /api/dashboard/api-keys/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDatabase()
    const apiKeyId = params.id

    // 检查API密钥是否存在
    const apiKey = await db.findOne('api_keys', { id: parseInt(apiKeyId) })
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API密钥不存在' },
        { status: 404 }
      )
    }

    // 删除API密钥
    await db.delete('api_keys', { id: parseInt(apiKeyId) })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('删除API密钥失败:', error)
    
    return NextResponse.json({
      error: '删除API密钥失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}

// PUT /api/dashboard/api-keys/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getDatabase()
    const apiKeyId = params.id
    const body = await request.json()

    // 验证必填字段
    if (!body.name) {
      return NextResponse.json(
        { error: '名称为必填字段' },
        { status: 400 }
      )
    }

    // 检查API密钥是否存在
    const apiKey = await db.findOne('api_keys', { id: parseInt(apiKeyId) })
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API密钥不存在' },
        { status: 404 }
      )
    }

    // 更新API密钥
    const updateData = {
      name: body.name,
      permissions: JSON.stringify(body.permissions || ['read']),
      is_active: body.is_active !== undefined ? body.is_active : true,
      expires_at: body.expires_at || null,
      updated_at: new Date().toISOString()
    }

    await db.update('api_keys', { id: parseInt(apiKeyId) }, updateData)

    // 返回更新后的API密钥
    const updatedApiKey = await db.findOne('api_keys', { id: parseInt(apiKeyId) })

    return NextResponse.json({
      success: true,
      apiKey: updatedApiKey
    })
  } catch (error) {
    console.error('更新API密钥失败:', error)
    
    return NextResponse.json({
      error: '更新API密钥失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}