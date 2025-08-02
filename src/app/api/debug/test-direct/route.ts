import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        error: '缺少Supabase配置',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const results: any = {
      timestamp: new Date().toISOString(),
      config: {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey
      },
      tests: []
    }

    // 测试1: 直接查询users表
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(1)

      if (error) {
        results.tests.push({
          name: '直接查询users表',
          status: 'error',
          error: error.message,
          code: error.code
        })
      } else {
        results.tests.push({
          name: '直接查询users表',
          status: 'success',
          data: data || []
        })
      }
    } catch (error) {
      results.tests.push({
        name: '直接查询users表',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }

    // 测试2: 尝试插入测试数据
    try {
      const testEmail = `test-${Date.now()}@example.com`
      const { data, error } = await supabase
        .from('users')
        .insert({
          email: testEmail,
          username: `testuser_${Date.now()}`,
          password_hash: 'test_hash',
          role: 'user',
          is_active: true
        })
        .select()
        .single()

      if (error) {
        results.tests.push({
          name: '插入测试数据',
          status: 'error',
          error: error.message,
          code: error.code
        })
      } else {
        results.tests.push({
          name: '插入测试数据',
          status: 'success',
          data: data
        })

        // 清理测试数据
        await supabase
          .from('users')
          .delete()
          .eq('email', testEmail)
      }
    } catch (error) {
      results.tests.push({
        name: '插入测试数据',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }

    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json({
      error: '测试失败',
      message: error instanceof Error ? error.message : '未知错误',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 