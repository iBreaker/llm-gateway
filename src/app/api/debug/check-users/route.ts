import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    console.log('🔍 检查用户表数据...')
    
    const db = await getDatabase()
    
    // 1. 查询所有用户
    const users = await db.findMany('users')
    
    // 2. 尝试创建一个测试用户（如果不存在）
    let testUser = null
    try {
      const existingUser = await db.findOne('users', { email: 'test@example.com' })
      if (!existingUser) {
        testUser = await db.create('users', {
          email: 'test@example.com',
          username: 'testuser',
          password_hash: 'dummy_hash_' + Date.now(),
          role: 'user',
          is_active: true
        })
      } else {
        testUser = existingUser
      }
    } catch (error) {
      console.error('创建测试用户失败:', error)
    }
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      users: {
        count: users.length,
        data: users
      },
      testUser: testUser,
      message: `找到 ${users.length} 个用户`
    })
    
  } catch (error) {
    console.error('❌ 检查用户失败:', error)
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: `检查用户失败: ${error instanceof Error ? error.message : '未知错误'}`,
      stack: error instanceof Error ? error.stack : undefined
    }, {
      status: 500
    })
  }
}