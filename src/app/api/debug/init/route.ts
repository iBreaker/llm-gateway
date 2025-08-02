import { NextResponse } from 'next/server'
import { systemConfig } from '@/lib/config'

export async function GET() {
  try {
    console.log('🔍 开始诊断系统初始化...')
    
    // 1. 检查环境变量
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'NOT_SET',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET',
      POSTGRES_URL: process.env.POSTGRES_URL ? 'SET' : 'NOT_SET',
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT_SET',
    }
    console.log('📋 环境变量检查:', envCheck)

    // 2. 检查配置生成
    let configCheck
    try {
      configCheck = {
        database: {
          type: systemConfig.database.type,
          url: systemConfig.database.url ? 'SET' : 'NOT_SET',
          hasOptions: !!systemConfig.database.options
        },
        cache: {
          type: systemConfig.cache.type,
          url: systemConfig.cache.url ? 'SET' : 'NOT_SET'
        }
      }
      console.log('⚙️ 配置生成成功:', configCheck)
    } catch (configError) {
      console.error('❌ 配置生成失败:', configError)
      configCheck = { error: configError instanceof Error ? configError.message : '配置生成失败' }
    }

    // 3. 尝试手动初始化数据库适配器
    let dbAdapterCheck: any
    try {
      const { createDatabaseAdapter } = await import('@/lib/adapters')
      const adapter = await createDatabaseAdapter(systemConfig.database)
      dbAdapterCheck = { 
        created: true, 
        type: systemConfig.database.type,
        isConnected: adapter.isConnected() 
      }
      console.log('💾 数据库适配器创建成功:', dbAdapterCheck)
      
      // 尝试连接
      const connectStart = Date.now()
      await adapter.connect()
      const connectTime = Date.now() - connectStart
      dbAdapterCheck.connected = true
      dbAdapterCheck.connectTime = connectTime
      console.log(`✅ 数据库连接成功 (耗时: ${connectTime}ms)`)
      
      await adapter.disconnect()
    } catch (dbError) {
      console.error('❌ 数据库适配器测试失败:', dbError)
      
      // 捕获详细的错误信息
      let errorDetails: any = {
        message: dbError instanceof Error ? dbError.message : '数据库适配器失败',
        name: dbError instanceof Error ? dbError.name : 'UnknownError'
      }
      
      // 如果是 Supabase 错误，尝试提取更多信息
      if (dbError && typeof dbError === 'object') {
        const error = dbError as any
        if (error.code) errorDetails.code = error.code
        if (error.details) errorDetails.details = error.details
        if (error.hint) errorDetails.hint = error.hint
        if (error.status) errorDetails.status = error.status
        if (error.statusText) errorDetails.statusText = error.statusText
        if (error.cause) errorDetails.cause = error.cause
      }
      
      dbAdapterCheck = { 
        error: errorDetails.message,
        errorDetails,
        stack: dbError instanceof Error ? dbError.stack : undefined
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'diagnostic',
      checks: {
        environment: envCheck,
        config: configCheck,
        databaseAdapter: dbAdapterCheck
      }
    })
    
  } catch (error) {
    console.error('❌ 诊断过程失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `诊断失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
}