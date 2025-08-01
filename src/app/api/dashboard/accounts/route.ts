import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 获取上游账号列表
    const accounts = await db.findMany('upstream_accounts')
    
    // 获取统计信息
    const [totalAccounts, activeAccounts, errorAccounts] = await Promise.all([
      db.count('upstream_accounts'),
      db.count('upstream_accounts', { is_active: 1 }),
      db.raw<{ count: number }>(`
        SELECT COUNT(*) as count FROM upstream_accounts WHERE error_count > success_count * 0.1
      `).then(result => result[0]?.count || 0)
    ])
    
    // 计算平均成功率
    const avgSuccessRate = await db.raw<{ avg_success_rate: number }>(`
      SELECT AVG(
        CASE 
          WHEN request_count > 0 
          THEN (success_count * 100.0 / request_count)
          ELSE 100
        END
      ) as avg_success_rate
      FROM upstream_accounts
    `).then(result => result[0]?.avg_success_rate || 100)

    // 转换账号数据格式
    const formattedAccounts = accounts.map((account: any) => ({
      id: account.id?.toString(),
      type: account.type,
      email: account.email,
      status: account.is_active ? 'active' : 'inactive',
      lastUsed: getTimeAgo(account.updated_at),
      requestCount: account.request_count || 0,
      successRate: account.request_count > 0 
        ? Math.round((account.success_count / account.request_count) * 1000) / 10
        : 100,
      createdAt: formatDate(account.created_at)
    }))

    const stats = {
      totalAccounts,
      activeAccounts,
      errorAccounts,
      avgSuccessRate: Math.round(avgSuccessRate * 10) / 10
    }

    return NextResponse.json({
      accounts: formattedAccounts,
      stats
    })
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