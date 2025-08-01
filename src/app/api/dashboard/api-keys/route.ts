import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 获取API密钥列表
    const apiKeys = await db.findMany('api_keys')
    
    // 获取统计信息
    const [totalKeys, activeKeys, totalRequests, todayRequests] = await Promise.all([
      db.count('api_keys'),
      db.count('api_keys', { is_active: 1 }),
      db.raw<{ total: number }>(`
        SELECT SUM(request_count) as total FROM api_keys
      `).then(result => result[0]?.total || 0),
      // 今日请求数（从使用记录表获取）
      db.raw<{ count: number }>(`
        SELECT COUNT(*) as count FROM usage_records 
        WHERE DATE(created_at) = DATE('now')
      `).then(result => result[0]?.count || 0)
    ])
    
    // 转换API密钥数据格式
    const formattedApiKeys = apiKeys.map(key => ({
      id: key.id?.toString(),
      name: key.name,
      key: key.key_hash, // 注意：这里应该是已经hash的值，不是原始密钥
      permissions: JSON.parse(key.permissions || '[]'),
      lastUsed: getTimeAgo(key.updated_at),
      requestCount: key.request_count || 0,
      status: key.is_active ? 'active' : 'inactive',
      expiresAt: key.expires_at ? formatDate(key.expires_at) : null,
      createdAt: formatDate(key.created_at)
    }))

    const stats = {
      totalKeys,
      activeKeys,
      totalRequests,
      todayRequests
    }

    return NextResponse.json({
      apiKeys: formattedApiKeys,
      stats
    })
  } catch (error) {
    console.error('获取API密钥数据失败:', error)
    
    return NextResponse.json({
      error: '获取API密钥数据失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}

function getTimeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffDays > 0) {
    return `${diffDays}天前`
  } else if (diffHours > 0) {
    return `${diffHours}小时前`
  } else {
    return `刚刚`
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toISOString().split('T')[0]
}