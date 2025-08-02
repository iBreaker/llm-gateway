import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'
import { SqlLoader } from '@/lib/db/schemas/sql-loader'

export async function POST() {
  try {
    console.log('🚀 开始自动数据库初始化...')
    
    const db = await getDatabase()
    const sqlLoader = new SqlLoader()
    
    const results: any = {
      timestamp: new Date().toISOString(),
      status: 'success',
      tables: {},
      summary: {
        totalTables: 4,
        existingTables: 0,
        createdTables: 0,
        failedTables: 0
      }
    }
    
    // 验证SQL文件是否存在
    const sqlFiles = sqlLoader.validateSqlFiles()
    results.sqlFiles = sqlFiles
    
    // 加载SQL文件
    const { tables, indexes: sqlIndexes, triggers } = sqlLoader.loadBaseSqlFiles()
    
    // 定义需要创建的表
    const tableDefinitions = [
      {
        name: 'users',
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
      },
      {
        name: 'api_keys',
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
      },
      {
        name: 'upstream_accounts',
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
      },
      {
        name: 'usage_records',
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
      }
    ]
    
    // 检查并创建每个表
    for (const tableDef of tableDefinitions) {
      try {
        // 首先检查表是否存在
        const exists = await db.exists(tableDef.name, {})
        
        if (exists) {
          results.tables[tableDef.name] = {
            status: 'exists',
            message: '表已存在'
          }
          results.summary.existingTables++
        } else {
          // 表不存在，尝试创建
          try {
            await db.raw(tableDef.sql)
            results.tables[tableDef.name] = {
              status: 'created',
              message: '表创建成功'
            }
            results.summary.createdTables++
          } catch (createError) {
            results.tables[tableDef.name] = {
              status: 'failed',
              message: '表创建失败',
              error: createError instanceof Error ? createError.message : '未知错误'
            }
            results.summary.failedTables++
          }
        }
      } catch (error) {
        results.tables[tableDef.name] = {
          status: 'error',
          message: '检查表状态失败',
          error: error instanceof Error ? error.message : '未知错误'
        }
        results.summary.failedTables++
      }
    }
    
    // 创建索引
    const indexes = [
      { name: 'idx_users_email', sql: 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);' },
      { name: 'idx_users_username', sql: 'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);' },
      { name: 'idx_users_is_active', sql: 'CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);' },
      { name: 'idx_api_keys_user_id', sql: 'CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);' },
      { name: 'idx_api_keys_key_hash', sql: 'CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);' },
      { name: 'idx_api_keys_is_active', sql: 'CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);' },
      { name: 'idx_api_keys_expires_at', sql: 'CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);' },
    ]
    
    results.indexes = {}
    for (const index of indexes) {
      try {
        await db.raw(index.sql)
        results.indexes[index.name] = { status: 'created' }
      } catch (error) {
        results.indexes[index.name] = { 
          status: 'failed', 
          error: error instanceof Error ? error.message : '未知错误' 
        }
      }
    }
    
    // 设置最终状态
    if (results.summary.failedTables > 0) {
      results.status = 'partial'
      results.message = `部分表创建失败，请检查错误信息`
    } else if (results.summary.createdTables > 0) {
      results.message = `数据库初始化完成，创建了 ${results.summary.createdTables} 个新表`
    } else {
      results.message = `所有表都已存在，无需初始化`
    }
    
    console.log('✅ 自动数据库初始化完成:', results.message)
    
    return NextResponse.json(results)
    
  } catch (error) {
    console.error('❌ 自动数据库初始化失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `自动数据库初始化失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
} 