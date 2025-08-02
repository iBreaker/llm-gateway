import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        error: '缺少Supabase配置',
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

    const results: any = {
      timestamp: new Date().toISOString(),
      config: {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseKey,
        hasServiceRoleKey: !!serviceRoleKey
      },
      tests: []
    }

    // 测试1: 使用anon key连接
    try {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      // 检查所有表
      const { data: tables, error } = await supabase
        .rpc('exec_sql', { 
          sql: `
            SELECT 
              schemaname,
              tablename,
              tableowner
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename;
          `
        })

      if (error) {
        results.tests.push({
          name: '查询所有表（anon key）',
          status: 'error',
          error: error.message,
          code: error.code
        })
      } else {
        results.tests.push({
          name: '查询所有表（anon key）',
          status: 'success',
          tables: tables || []
        })
      }
    } catch (error) {
      results.tests.push({
        name: 'anon key连接测试',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }

    // 测试2: 使用service role key连接
    if (serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })

        // 检查所有表
        const { data: tables, error } = await supabaseAdmin
          .rpc('exec_sql', { 
            sql: `
              SELECT 
                schemaname,
                tablename,
                tableowner
              FROM pg_tables 
              WHERE schemaname = 'public'
              ORDER BY tablename;
            `
          })

        if (error) {
          results.tests.push({
            name: '查询所有表（service role）',
            status: 'error',
            error: error.message,
            code: error.code
          })
        } else {
          results.tests.push({
            name: '查询所有表（service role）',
            status: 'success',
            tables: tables || []
          })
        }
      } catch (error) {
        results.tests.push({
          name: 'service role连接测试',
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        })
      }
    }

    // 测试3: 尝试创建exec_sql函数（如果不存在）
    if (serviceRoleKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        })

        const { error } = await supabaseAdmin
          .rpc('exec_sql', { 
            sql: `
              CREATE OR REPLACE FUNCTION exec_sql(sql text)
              RETURNS void
              LANGUAGE plpgsql
              SECURITY DEFINER
              AS $$
              BEGIN
                EXECUTE sql;
              END;
              $$;
            `
          })

        if (error) {
          results.tests.push({
            name: '创建exec_sql函数',
            status: 'error',
            error: error.message,
            note: '函数可能已存在或权限不足'
          })
        } else {
          results.tests.push({
            name: '创建exec_sql函数',
            status: 'success',
            note: '函数创建成功'
          })
        }
      } catch (error) {
        results.tests.push({
          name: '创建exec_sql函数',
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        })
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json({
      error: '检查数据库表失败',
      message: error instanceof Error ? error.message : '未知错误',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 