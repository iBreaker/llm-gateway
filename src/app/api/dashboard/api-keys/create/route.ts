import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'
import crypto from 'crypto'

// POST /api/dashboard/api-keys/create
export async function POST(request: NextRequest) {
  try {
    const db = await getDatabase()
    const body = await request.json()

    // 从认证头中获取用户ID
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json(
        { error: '用户未认证' },
        { status: 401 }
      )
    }

    // 验证必填字段
    if (!body.name) {
      return NextResponse.json(
        { error: '名称为必填字段' },
        { status: 400 }
      )
    }

    // 首先检查或创建用户记录（将Supabase UUID映射到我们的用户表）
    const userEmail = request.headers.get('x-user-email') || ''
    let userRecord = await db.findOne('users', { email: userEmail })
    
    if (!userRecord) {
      // 创建用户记录
      userRecord = await db.create('users', {
        email: userEmail,
        username: userEmail.split('@')[0] || 'user',
        password_hash: 'supabase_auth', // 标记为Supabase认证用户
        role: 'user',
        is_active: true
      })
      console.log('创建新用户记录:', userRecord)
    }

    // 生成API密钥
    const apiKey = generateApiKey()
    const keyHash = hashApiKey(apiKey)

    // 创建新API密钥
    const apiKeyData = {
      user_id: userRecord.id, // 使用我们数据库中的用户ID
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
        ...(newApiKey as any),
        key: apiKey // 只在创建时返回完整密钥
      }
    })
  } catch (error) {
    console.error('创建API密钥失败:', error)
    
    // 提供更详细的错误信息
    let errorMessage = '未知错误'
    let statusCode = 500
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      // 检查是否是表不存在的错误
      if (errorMessage.includes('relation "api_keys" does not exist') || 
          errorMessage.includes('table "api_keys" does not exist')) {
        errorMessage = '数据库表未创建，请先在Supabase Dashboard中执行supabase-init.sql'
        statusCode = 503 // Service Unavailable
      }
    }
    
    return NextResponse.json({
      error: '创建API密钥失败',
      message: errorMessage,
      details: error instanceof Error ? {
        name: error.name,
        stack: error.stack
      } : undefined,
      recommendation: statusCode === 503 ? {
        action: '请执行数据库初始化',
        steps: [
          '1. 登录Supabase Dashboard',
          '2. 进入SQL Editor',
          '3. 执行项目根目录的supabase-init.sql文件',
          '4. 重新尝试创建API密钥'
        ]
      } : undefined
    }, {
      status: statusCode
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