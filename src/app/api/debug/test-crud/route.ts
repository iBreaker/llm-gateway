import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'
import crypto from 'crypto'

export async function GET() {
  try {
    console.log('🔍 开始测试数据库CRUD操作...')
    
    const db = await getDatabase()
    
    // 测试结果
    const results: any = {
      timestamp: new Date().toISOString(),
      adapter: db.constructor.name,
      tests: []
    }
    
    // 测试1：检查数据库连接
    try {
      const isConnected = db.isConnected()
      results.tests.push({
        name: '数据库连接检查',
        status: isConnected ? 'success' : 'error',
        result: { connected: isConnected }
      })
    } catch (error) {
      results.tests.push({
        name: '数据库连接检查',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 测试2：检查表是否存在（通过查询测试）
    try {
      const usersCount = await db.count('users')
      results.tests.push({
        name: '用户表查询测试',
        status: 'success',
        result: { count: usersCount }
      })
    } catch (error) {
      results.tests.push({
        name: '用户表查询测试',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误',
        note: 'users表可能不存在，请手动执行SQL创建表'
      })
    }
    
    // 测试3：创建测试用户
    let testUserId: any = null
    try {
      const testEmail = `test-${Date.now()}@example.com`
      const testUser = await db.create('users', {
        email: testEmail,
        username: `testuser_${Date.now()}`,
        password_hash: 'test_hash_' + crypto.randomBytes(16).toString('hex'),
        role: 'user',
        is_active: true
      })
      
      testUserId = testUser.id
      results.tests.push({
        name: '创建测试用户',
        status: 'success',
        result: { 
          id: testUser.id,
          email: testUser.email,
          username: testUser.username
        }
      })
    } catch (error) {
      results.tests.push({
        name: '创建测试用户',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 测试4：查询用户
    if (testUserId) {
      try {
        const foundUser = await db.findOne('users', { id: testUserId })
        results.tests.push({
          name: '查询用户',
          status: foundUser ? 'success' : 'error',
          result: foundUser ? { found: true, id: foundUser.id } : { found: false }
        })
      } catch (error) {
        results.tests.push({
          name: '查询用户',
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        })
      }
    }
    
    // 测试5：创建API密钥（如果用户创建成功）
    let testApiKeyId: any = null
    if (testUserId) {
      try {
        const apiKey = 'llmgw_sk_' + crypto.randomBytes(32).toString('hex')
        const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
        
        const testApiKey = await db.create('api_keys', {
          user_id: testUserId,
          name: `test-key-${Date.now()}`,
          key_hash: keyHash,
          permissions: JSON.stringify(['read']),
          is_active: true,
          request_count: 0
        })
        
        testApiKeyId = testApiKey.id
        results.tests.push({
          name: '创建API密钥',
          status: 'success',
          result: { 
            id: testApiKey.id,
            name: testApiKey.name,
            user_id: testApiKey.user_id
          }
        })
      } catch (error) {
        results.tests.push({
          name: '创建API密钥',
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        })
      }
    }
    
    // 测试6：更新用户
    if (testUserId) {
      try {
        const updatedUser = await db.update('users', 
          { id: testUserId }, 
          { role: 'premium' }
        )
        results.tests.push({
          name: '更新用户',
          status: 'success',
          result: { 
            id: updatedUser.id,
            role: updatedUser.role,
            updated: true
          }
        })
      } catch (error) {
        results.tests.push({
          name: '更新用户',
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误'
        })
      }
    }
    
    // 测试7：批量查询
    try {
      const allUsers = await db.findMany('users', {}, { limit: 10 })
      results.tests.push({
        name: '批量查询用户',
        status: 'success',
        result: { 
          count: allUsers.length,
          hasTestUser: testUserId ? allUsers.some(u => u.id === testUserId) : false
        }
      })
    } catch (error) {
      results.tests.push({
        name: '批量查询用户',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 清理测试数据
    let cleanupResults: any = { deleted_api_keys: 0, deleted_users: 0 }
    
    if (testApiKeyId) {
      try {
        const deletedApiKeys = await db.delete('api_keys', { id: testApiKeyId })
        cleanupResults.deleted_api_keys = deletedApiKeys
      } catch (error) {
        console.warn('清理API密钥失败:', error)
      }
    }
    
    if (testUserId) {
      try {
        const deletedUsers = await db.delete('users', { id: testUserId })
        cleanupResults.deleted_users = deletedUsers
      } catch (error) {
        console.warn('清理用户失败:', error)
      }
    }
    
    results.tests.push({
      name: '清理测试数据',
      status: 'success',
      result: cleanupResults
    })
    
    return NextResponse.json(results)
    
  } catch (error) {
    console.error('❌ CRUD测试失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `CRUD测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
}