import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'
import { createClient } from '@supabase/supabase-js'
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
    console.log('🔍 尝试查找用户:', userEmail)
    
    let userRecord: any = null
    
    try {
      userRecord = await db.findOne<{ id: number; email: string; username: string }>('users', { email: userEmail })
      console.log('✅ 用户查询结果:', userRecord ? '找到用户' : '未找到用户')
    } catch (findError) {
      console.error('❌ 查询用户失败:', findError)
      
      // 如果查询失败，尝试使用service role key直接操作
      console.log('🔄 尝试使用service role key创建用户...')
      try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        
        if (!supabaseUrl || !serviceRoleKey) {
          throw new Error('缺少service role key配置')
        }
        
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })
        
        const { data, error } = await supabaseAdmin
          .from('users')
          .insert({
            email: userEmail,
            username: userEmail.split('@')[0] || 'user',
            password_hash: 'supabase_auth',
            role: 'user',
            is_active: true
          })
          .select()
          .single()
        
        if (error) {
          throw error
        }
        
        userRecord = data
        console.log('✅ 使用service role创建用户成功:', userRecord)
      } catch (createError) {
        console.error('❌ 创建用户失败:', createError)
        
        // 如果创建也失败，返回详细错误信息
        return NextResponse.json({
          error: '创建API密钥失败',
          message: '无法查询或创建用户记录',
          details: {
            findError: findError instanceof Error ? findError.message : '未知错误',
            createError: createError instanceof Error ? createError.message : '未知错误',
            userEmail: userEmail
          },
          recommendation: {
            action: '请检查数据库连接和表结构',
            steps: [
              '1. 检查Supabase连接配置',
              '2. 确认users表已创建',
              '3. 检查RLS策略设置',
              '4. 尝试手动在Supabase Dashboard中创建用户',
              '5. 或者创建exec_sql函数以绕过RLS限制'
            ]
          }
        }, { status: 500 })
      }
    }
    
    if (!userRecord) {
      return NextResponse.json({
        error: '创建API密钥失败',
        message: '无法获取用户记录',
        details: { userEmail }
      }, { status: 500 })
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

    console.log('🔍 尝试创建API密钥...')
    const newApiKey = await db.create('api_keys', apiKeyData)
    console.log('✅ API密钥创建成功')

    return NextResponse.json({
      success: true,
      apiKey: {
        ...(newApiKey as any),
        key: apiKey // 只在创建时返回完整密钥
      }
    })
  } catch (error) {
    console.error('❌ 创建API密钥失败:', error)
    
    // 提供更详细的错误信息
    let errorMessage = '未知错误'
    let statusCode = 500
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      // 检查是否是表不存在的错误
      if (errorMessage.includes('relation "api_keys" does not exist') || 
          errorMessage.includes('table "api_keys" does not exist') ||
          errorMessage.includes('relation "users" does not exist') ||
          errorMessage.includes('table "users" does not exist')) {
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