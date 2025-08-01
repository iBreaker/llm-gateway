import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 这里应该从数据库获取真实数据，暂时返回模拟数据
    // TODO: 实现真实的数据库查询
    const apiKeys = [
      {
        id: '1',
        name: '生产环境密钥',
        key: 'llmgw_sk_1234567890abcdef1234567890abcdef',
        permissions: ['read', 'write'],
        lastUsed: '30分钟前',
        requestCount: 1245,
        status: 'active',
        expiresAt: '2024-12-31',
        createdAt: '2024-01-15'
      },
      {
        id: '2',
        name: '测试环境密钥',
        key: 'llmgw_sk_fedcba0987654321fedcba0987654321',
        permissions: ['read'],
        lastUsed: '2小时前',
        requestCount: 568,
        status: 'active',
        expiresAt: null,
        createdAt: '2024-01-12'
      },
      {
        id: '3',
        name: '开发环境密钥',
        key: 'llmgw_sk_abcdef1234567890abcdef1234567890',
        permissions: ['read', 'write', 'admin'],
        lastUsed: '1天前',
        requestCount: 89,
        status: 'inactive',
        expiresAt: '2024-06-30',
        createdAt: '2024-01-10'
      }
    ]

    return NextResponse.json(apiKeys)
  } catch (error) {
    console.error('获取 API 密钥数据失败:', error)
    
    return NextResponse.json({
      error: '获取 API 密钥数据失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}