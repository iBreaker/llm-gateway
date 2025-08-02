import { NextResponse } from 'next/server'
import { SqlLoader } from '@/lib/db/schemas/sql-loader'

export async function GET() {
  try {
    console.log('🔍 测试SQL加载器...')
    
    const sqlLoader = new SqlLoader()
    
    const results: any = {
      timestamp: new Date().toISOString(),
      status: 'success',
      tests: {}
    }
    
    // 测试1: 验证SQL文件是否存在
    const sqlFiles = sqlLoader.validateSqlFiles()
    results.tests.fileValidation = {
      status: 'success',
      files: sqlFiles,
      allExist: Object.values(sqlFiles).every(exists => exists)
    }
    
    // 测试2: 加载SQL文件
    const { tables, indexes, triggers } = sqlLoader.loadBaseSqlFiles()
    results.tests.fileLoading = {
      status: 'success',
      tablesLength: tables.length,
      indexesLength: indexes.length,
      triggersLength: triggers.length,
      hasTables: tables.length > 0,
      hasIndexes: indexes.length > 0,
      hasTriggers: triggers.length > 0
    }
    
    // 测试3: 数据库类型适配
    const testSql = 'CREATE TABLE test (id BIGSERIAL PRIMARY KEY, data JSONB);'
    const postgresqlSql = sqlLoader.adaptSqlForDatabase(testSql, 'postgresql')
    const mysqlSql = sqlLoader.adaptSqlForDatabase(testSql, 'mysql')
    const sqliteSql = sqlLoader.adaptSqlForDatabase(testSql, 'sqlite')
    
    results.tests.databaseAdaptation = {
      status: 'success',
      original: testSql,
      postgresql: postgresqlSql,
      mysql: mysqlSql,
      sqlite: sqliteSql
    }
    
    // 设置最终状态
    const allTestsPassed = results.tests.fileValidation.allExist && 
                          results.tests.fileLoading.hasTables &&
                          results.tests.fileLoading.hasIndexes
    
    results.status = allTestsPassed ? 'success' : 'partial'
    results.message = allTestsPassed 
      ? 'SQL加载器测试全部通过' 
      : 'SQL加载器测试部分通过，请检查缺失的文件'
    
    console.log('✅ SQL加载器测试完成:', results.message)
    
    return NextResponse.json(results)
    
  } catch (error) {
    console.error('❌ SQL加载器测试失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `SQL加载器测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
} 