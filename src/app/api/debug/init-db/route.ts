import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  try {
    console.log('🚀 开始初始化Supabase数据库...')
    
    // 获取 Supabase 配置
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY // 使用服务角色密钥以获得完整权限
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({
        error: '缺少Supabase配置',
        missing: {
          url: !supabaseUrl,
          serviceKey: !supabaseServiceKey
        }
      }, { status: 500 })
    }

    // 创建具有完整权限的客户端
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    const results = []

    // 1. 创建用户表
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      })
      
      if (error) throw error
      results.push({ table: 'users', status: 'success' })
    } catch (error) {
      console.error('创建users表失败:', error)
      results.push({ table: 'users', status: 'error', error: error.message })
    }

    // 2. 创建API密钥表
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS api_keys (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            key_hash TEXT UNIQUE NOT NULL,
            permissions JSONB DEFAULT '[]'::jsonb,
            is_active BOOLEAN DEFAULT true,
            expires_at TIMESTAMPTZ,
            last_used_at TIMESTAMPTZ,
            request_count BIGINT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      })
      
      if (error) throw error
      results.push({ table: 'api_keys', status: 'success' })
    } catch (error) {
      console.error('创建api_keys表失败:', error)
      results.push({ table: 'api_keys', status: 'error', error: error.message })
    }

    // 3. 创建上游账号表
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS upstream_accounts (
            id BIGSERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            email TEXT NOT NULL,
            credentials JSONB NOT NULL,
            is_active BOOLEAN DEFAULT true,
            priority INTEGER DEFAULT 1,
            weight INTEGER DEFAULT 100,
            last_used_at TIMESTAMPTZ,
            request_count BIGINT DEFAULT 0,
            success_count BIGINT DEFAULT 0,
            error_count BIGINT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      })
      
      if (error) throw error
      results.push({ table: 'upstream_accounts', status: 'success' })
    } catch (error) {
      console.error('创建upstream_accounts表失败:', error)
      results.push({ table: 'upstream_accounts', status: 'error', error: error.message })
    }

    // 4. 创建使用记录表
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS usage_records (
            id BIGSERIAL PRIMARY KEY,
            api_key_id BIGINT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
            upstream_account_id BIGINT REFERENCES upstream_accounts(id) ON DELETE SET NULL,
            request_id TEXT UNIQUE NOT NULL,
            method TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            status_code INTEGER,
            response_time INTEGER,
            tokens_used BIGINT DEFAULT 0,
            cost DECIMAL(10,4) DEFAULT 0,
            error_message TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      })
      
      if (error) throw error
      results.push({ table: 'usage_records', status: 'success' })
    } catch (error) {
      console.error('创建usage_records表失败:', error)
      results.push({ table: 'usage_records', status: 'error', error: error.message })
    }

    // 5. 创建索引
    const indexes = [
      { name: 'idx_users_email', sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);' },
      { name: 'idx_api_keys_user_id', sql: 'CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);' },
      { name: 'idx_api_keys_key_hash', sql: 'CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);' },
    ]

    for (const index of indexes) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: index.sql })
        if (error) throw error
        results.push({ index: index.name, status: 'success' })
      } catch (error) {
        console.error(`创建索引${index.name}失败:`, error)
        results.push({ index: index.name, status: 'error', error: error.message })
      }
    }

    console.log('✅ 数据库初始化完成')

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'success',
      message: '数据库初始化完成',
      results
    })

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `数据库初始化失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
}