import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'
import crypto from 'crypto'

export async function GET() {
  try {
    console.log('🔍 开始测试数据库功能...')
    
    const db = await getDatabase()
    
    // 测试结果
    const results: any = {
      timestamp: new Date().toISOString(),
      tests: []
    }
    
    // 1. 测试创建用户
    try {
      const testUser = await db.create('users', {
        email: 'test@example.com',
        username: 'testuser',
        password_hash: 'dummy_hash',
        role: 'user',
        is_active: true
      })
      results.tests.push({
        name: '创建测试用户',
        status: 'success',
        data: testUser
      })
    } catch (error) {
      results.tests.push({
        name: '创建测试用户',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 2. 测试查找用户
    try {
      const users = await db.findMany('users', { email: 'test@example.com' })
      results.tests.push({
        name: '查找用户',
        status: 'success',
        count: users.length,
        data: users
      })
    } catch (error) {
      results.tests.push({
        name: '查找用户',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 3. 测试创建 API 密钥
    try {
      const apiKey = 'llmgw_sk_' + crypto.randomBytes(32).toString('hex')
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex')
      
      const testApiKey = await db.create('api_keys', {
        user_id: 1, // 假设用户ID为1
        name: 'test-api-key',
        key_hash: keyHash,
        permissions: ['read', 'write'],
        is_active: true,
        request_count: 0
      })
      
      results.tests.push({
        name: '创建API密钥',
        status: 'success',
        data: testApiKey
      })
    } catch (error) {
      results.tests.push({
        name: '创建API密钥',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 4. 测试查询 API 密钥
    try {
      const apiKeys = await db.findMany('api_keys', { name: 'test-api-key' })
      results.tests.push({
        name: '查询API密钥',
        status: 'success',
        count: apiKeys.length,
        data: apiKeys
      })
    } catch (error) {
      results.tests.push({
        name: '查询API密钥',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    // 5. 清理测试数据
    try {
      await db.delete('api_keys', { name: 'test-api-key' })
      await db.delete('users', { email: 'test@example.com' })
      results.tests.push({
        name: '清理测试数据',
        status: 'success'
      })
    } catch (error) {
      results.tests.push({
        name: '清理测试数据',
        status: 'error',
        error: error instanceof Error ? error.message : '未知错误'
      })
    }
    
    return NextResponse.json(results)
    
  } catch (error) {
    console.error('❌ 数据库测试失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `数据库测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
}