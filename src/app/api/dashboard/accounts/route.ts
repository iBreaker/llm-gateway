import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 这里应该从数据库获取真实数据，暂时返回模拟数据
    // TODO: 实现真实的数据库查询
    const accounts = [
      {
        id: '1',
        type: 'claude',
        email: 'claude1@example.com',
        status: 'active',
        lastUsed: '2小时前',
        requestCount: 2456,
        successRate: 99.8,
        createdAt: '2024-01-15'
      },
      {
        id: '2',
        type: 'gemini',
        email: 'gemini1@example.com',
        status: 'active',
        lastUsed: '1小时前',
        requestCount: 1823,
        successRate: 98.5,
        createdAt: '2024-01-12'
      },
      {
        id: '3',
        type: 'claude',
        email: 'claude2@example.com',
        status: 'inactive',
        lastUsed: '1天前',
        requestCount: 945,
        successRate: 99.1,
        createdAt: '2024-01-10'
      },
      {
        id: '4',
        type: 'gemini',
        email: 'gemini2@example.com',
        status: 'error',
        lastUsed: '3天前',
        requestCount: 234,
        successRate: 87.2,
        createdAt: '2024-01-08'
      }
    ]

    return NextResponse.json(accounts)
  } catch (error) {
    console.error('获取账号数据失败:', error)
    
    return NextResponse.json({
      error: '获取账号数据失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}