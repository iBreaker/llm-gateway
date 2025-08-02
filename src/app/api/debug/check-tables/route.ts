import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    console.log('🔍 检查数据库表状态...')
    
    const db = await getDatabase()
    
    const results: any = {
      timestamp: new Date().toISOString(),
      tables: {}
    }
    
    // 检查各个表是否存在
    const tables = ['users', 'api_keys', 'upstream_accounts', 'usage_records']
    
    for (const tableName of tables) {
      try {
        // 尝试查询表结构
        const count = await db.count(tableName)
        results.tables[tableName] = {
          exists: true,
          recordCount: count,
          status: 'success'
        }
      } catch (error) {
        results.tables[tableName] = {
          exists: false,
          error: error instanceof Error ? error.message : '未知错误',
          status: 'error'
        }
      }
    }
    
    // 检查是否有表存在
    const existingTables = Object.values(results.tables).filter((table: any) => table.exists)
    results.summary = {
      totalTables: tables.length,
      existingTables: existingTables.length,
      missingTables: tables.length - existingTables.length,
      needsMigration: existingTables.length === 0
    }
    
    if (results.summary.needsMigration) {
      results.recommendation = {
        action: '请在Supabase Dashboard > SQL Editor中执行supabase-init.sql文件',
        sqlFile: '项目根目录的supabase-init.sql',
        manualSteps: [
          '1. 登录Supabase Dashboard',
          '2. 进入SQL Editor',
          '3. 复制supabase-init.sql内容并执行',
          '4. 重新测试API密钥创建'
        ]
      }
    }
    
    return NextResponse.json(results)
    
  } catch (error) {
    console.error('❌ 检查数据库表失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `检查数据库表失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
} 