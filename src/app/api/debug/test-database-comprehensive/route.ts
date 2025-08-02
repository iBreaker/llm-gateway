import { NextRequest, NextResponse } from 'next/server'
import { ServiceRegistry } from '@/lib/adapters'
import { systemConfig } from '@/lib/config'
import type { DatabaseUser, DatabaseApiKey } from '@/lib/interfaces/database'

/**
 * 综合数据库读写测试端点
 * 测试所有 CRUD 操作、事务、健康检查等功能
 */
export async function GET(request: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  }

  try {
    // 初始化数据库连接
    console.log('🔄 正在初始化数据库连接...')
    const registry = ServiceRegistry.getInstance()
    const db = await registry.initializeDatabase(systemConfig.database)
    
    results.tests.push({
      name: '数据库连接初始化',
      status: 'passed',
      details: '数据库连接成功建立'
    })

    // 测试 1: 健康检查
    console.log('🏥 执行健康检查...')
    const healthResult = await db.healthCheck()
    results.tests.push({
      name: '健康检查',
      status: healthResult.connected ? 'passed' : 'failed',
      details: healthResult
    })

    // 测试 2: 创建用户
    console.log('👤 测试用户创建...')
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      username: `testuser-${Date.now()}`,
      passwordHash: 'hashed_password_123',
      role: 'user',
      isActive: true
    }
    
    const createdUser = await db.create<DatabaseUser>('users', testUser)
    const userCreated = createdUser && createdUser.id
    
    results.tests.push({
      name: '用户创建',
      status: userCreated ? 'passed' : 'failed',
      details: userCreated ? `用户ID: ${createdUser.id}` : '用户创建失败'
    })

    if (userCreated) {
      const userId = createdUser.id

      // 测试 3: 查询用户
      console.log('🔍 测试用户查询...')
      const foundUser = await db.findOne<DatabaseUser>('users', { id: userId })
      results.tests.push({
        name: '用户查询',
        status: foundUser ? 'passed' : 'failed',
        details: foundUser ? `找到用户: ${foundUser.email}` : '用户查询失败'
      })

      // 测试 4: 更新用户
      console.log('✏️ 测试用户更新...')
      const updatedUser = await db.update<DatabaseUser>('users', { id: userId }, { role: 'admin' })
      results.tests.push({
        name: '用户更新',
        status: updatedUser && updatedUser.role === 'admin' ? 'passed' : 'failed',
        details: updatedUser ? `角色更新为: ${updatedUser.role}` : '用户更新失败'
      })

      // 测试 5: 创建API密钥
      console.log('🔑 测试API密钥创建...')
      const testApiKey = {
        userId: userId,
        name: `Test API Key ${Date.now()}`,
        keyHash: `hash_${Date.now()}`,
        permissions: ['read', 'write'],
        isActive: true,
        requestCount: 0
      }
      
      const createdApiKey = await db.create<DatabaseApiKey>('api_keys', testApiKey)
      const apiKeyCreated = createdApiKey && createdApiKey.id
      
      results.tests.push({
        name: 'API密钥创建',
        status: apiKeyCreated ? 'passed' : 'failed',
        details: apiKeyCreated ? `API密钥ID: ${createdApiKey.id}` : 'API密钥创建失败'
      })

      // 测试 6: 批量查询
      console.log('📊 测试批量查询...')
      const allUsers = await db.findMany<DatabaseUser>('users', { isActive: true })
      results.tests.push({
        name: '批量查询',
        status: Array.isArray(allUsers) && allUsers.length > 0 ? 'passed' : 'failed',
        details: `找到 ${allUsers?.length || 0} 个活跃用户`
      })

      // 测试 7: 计数查询
      console.log('🔢 测试计数查询...')
      const userCount = await db.count('users')
      results.tests.push({
        name: '计数查询',
        status: typeof userCount === 'number' && userCount > 0 ? 'passed' : 'failed',
        details: `用户总数: ${userCount}`
      })

      // 测试 8: 存在性检查
      console.log('✅ 测试存在性检查...')
      const userExists = await db.exists('users', { id: userId })
      results.tests.push({
        name: '存在性检查',
        status: userExists ? 'passed' : 'failed',
        details: `用户存在: ${userExists}`
      })

      // 测试 9: 事务测试
      console.log('🔄 测试事务处理...')
      try {
        await db.transaction(async (tx) => {
          // 在事务中创建一个上游账号
          const testAccount = {
            type: 'claude',
            email: `transaction-test-${Date.now()}@example.com`,
            credentials: { token: 'test_token' },
            isActive: true,
            priority: 1,
            weight: 100,
            requestCount: 0,
            successCount: 0,
            errorCount: 0
          }
          
          await tx.create('upstream_accounts', testAccount)
          
          // 更新用户的最后更新时间
          await tx.update('users', { id: userId }, { 
            updatedAt: new Date() 
          })
        })
        
        results.tests.push({
          name: '事务处理',
          status: 'passed',
          details: '事务执行成功'
        })
      } catch (error) {
        results.tests.push({
          name: '事务处理',
          status: 'failed',
          details: `事务失败: ${error instanceof Error ? error.message : String(error)}`
        })
      }

      // 测试 10: 原生SQL查询
      console.log('🗃️ 测试原生SQL查询...')
      try {
        const sqlResult = await db.raw('SELECT COUNT(*) as count FROM users WHERE is_active = ?', [true])
        results.tests.push({
          name: '原生SQL查询',
          status: Array.isArray(sqlResult) ? 'passed' : 'failed',
          details: `SQL查询结果: ${JSON.stringify(sqlResult)}`
        })
      } catch (error) {
        results.tests.push({
          name: '原生SQL查询',
          status: 'failed',
          details: `SQL查询失败: ${error instanceof Error ? error.message : String(error)}`
        })
      }

      // 清理测试数据
      console.log('🧹 清理测试数据...')
      if (apiKeyCreated) {
        await db.delete('api_keys', { id: createdApiKey.id })
      }
      await db.delete('users', { id: userId })
      
      results.tests.push({
        name: '测试数据清理',
        status: 'passed',
        details: '测试数据已清理'
      })
    }

    // 计算测试结果统计
    results.summary.total = results.tests.length
    results.summary.passed = results.tests.filter((t: any) => t.status === 'passed').length
    results.summary.failed = results.tests.filter((t: any) => t.status === 'failed').length
    
    console.log(`✅ 数据库测试完成: ${results.summary.passed}/${results.summary.total} 通过`)

    return NextResponse.json({
      success: true,
      message: '数据库综合测试完成',
      data: results
    })

  } catch (error) {
    console.error('❌ 数据库测试失败:', error)
    
    results.tests.push({
      name: '测试执行',
      status: 'failed',
      details: `测试执行失败: ${error instanceof Error ? error.message : String(error)}`
    })
    
    results.summary.total = results.tests.length
    results.summary.passed = results.tests.filter((t: any) => t.status === 'passed').length
    results.summary.failed = results.tests.filter((t: any) => t.status === 'failed').length

    return NextResponse.json({
      success: false,
      message: '数据库综合测试失败',
      error: error instanceof Error ? error.message : String(error),
      data: results
    }, { status: 500 })
  }
}