import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'
import crypto from 'crypto'

// POST /api/dashboard/api-keys/create
export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase()
    const body = await request.json()

    // 验证必填字段
    if (!body.name || !body.user_id) {
      return NextResponse.json(
        { error: '名称和用户ID为必填字段' },
        { status: 400 }
      )
    }

    // 生成API密钥
    const apiKey = generateApiKey()
    const keyHash = hashApiKey(apiKey)

    // 创建新API密钥
    const apiKeyData = {
      user_id: body.user_id,
      name: body.name,
      key_hash: keyHash,
      permissions: JSON.stringify(body.permissions || ['read']),
      is_active: body.is_active !== undefined ? body.is_active : true,
      expires_at: body.expires_at || null,
      request_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const newApiKey = await db.create('api_keys', apiKeyData)

    return NextResponse.json({
      success: true,
      apiKey: {
        ...newApiKey,
        key: apiKey // 只在创建时返回完整密钥
      }
    })
  } catch (error) {
    console.error('创建API密钥失败:', error)
    
    return NextResponse.json({
      error: '创建API密钥失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}

function generateApiKey(): string {
  const prefix = 'llmgw_sk_'
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return prefix + randomBytes
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}