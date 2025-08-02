import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { getDatabaseConfig } from '@/lib/utils/database-config'

/**
 * 检查环境变量和数据库配置
 */
export async function GET(request: NextRequest) {
  try {
    // 检查关键环境变量
    const envCheck = {
      NODE_ENV: env.NODE_ENV,
      VERCEL: process.env.VERCEL || 'NOT_SET',
      
      // 数据库相关
      POSTGRES_URL: env.POSTGRES_URL ? 'SET' : 'NOT_SET',
      POSTGRES_URL_NON_POOLING: env.POSTGRES_URL_NON_POOLING ? 'SET' : 'NOT_SET', 
      SUPABASE_URL: env.SUPABASE_URL ? 'SET' : 'NOT_SET',
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? 'SET' : 'NOT_SET',
      DATABASE_URL: env.DATABASE_URL !== './data/dev.db' ? 'SET' : 'DEFAULT',
      
      // 安全相关
      JWT_SECRET: env.JWT_SECRET ? 'SET' : 'NOT_SET',
      ENCRYPTION_MASTER_KEY: env.ENCRYPTION_MASTER_KEY ? 'SET' : 'NOT_SET'
    }

    // 获取数据库配置
    const dbConfig = getDatabaseConfig()
    
    // 提供实际值的前缀用于调试
    const urlDetails = {
      selectedUrl: dbConfig.url ? dbConfig.url.substring(0, 30) + '...' : 'NOT_SET',
      urlType: dbConfig.url?.includes('postgresql') ? 'PostgreSQL' :
               dbConfig.url?.includes('supabase') ? 'Supabase' :
               dbConfig.url?.includes('sqlite') ? 'SQLite' : 'Unknown',
      configType: dbConfig.type
    }

    return NextResponse.json({
      success: true,
      data: {
        environment: envCheck,
        databaseConfig: {
          type: dbConfig.type,
          hasUrl: !!dbConfig.url,
          urlDetails,
          options: dbConfig.options
        },
        deployment: {
          isVercel: process.env.VERCEL === '1',
          nodeEnv: env.NODE_ENV
        }
      }
    })

  } catch (error) {
    console.error('❌ 环境配置检查失败:', error)
    
    return NextResponse.json({
      success: false,
      message: '环境配置检查失败',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}