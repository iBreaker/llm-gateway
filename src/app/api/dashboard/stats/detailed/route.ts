import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 获取总体统计
    const [totalRequests, totalCost, avgResponseTime, successRate] = await Promise.all([
      db.count('usage_records'),
      db.raw<{ total_cost: number }>(`
        SELECT SUM(cost) as total_cost FROM usage_records
      `).then(result => result[0]?.total_cost || 0),
      db.raw<{ avg_response_time: number }>(`
        SELECT AVG(response_time) as avg_response_time 
        FROM usage_records 
        WHERE response_time IS NOT NULL
      `).then(result => result[0]?.avg_response_time || 0),
      db.raw<{ success_rate: number }>(`
        SELECT 
          CASE 
            WHEN COUNT(*) > 0 
            THEN (COUNT(CASE WHEN status_code = 200 THEN 1 END) * 100.0 / COUNT(*))
            ELSE 100
          END as success_rate
        FROM usage_records
      `).then(result => result[0]?.success_rate || 100)
    ])
    
    // 获取7天的每日统计
    const dailyStats = await db.raw<{
      date: string
      requests: number
      cost: number
      success_rate: number
    }[]>(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as requests,
        SUM(cost) as cost,
        (COUNT(CASE WHEN status_code = 200 THEN 1 END) * 100.0 / COUNT(*)) as success_rate
      FROM usage_records 
      WHERE created_at >= DATE('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `)
    
    // 获取Top API密钥
    const topApiKeys = await db.raw<{
      name: string
      requests: number
      cost: number
    }[]>(`
      SELECT 
        ak.name,
        COUNT(ur.id) as requests,
        SUM(ur.cost) as cost
      FROM api_keys ak
      LEFT JOIN usage_records ur ON ak.id = ur.api_key_id
      WHERE ak.is_active = 1
      GROUP BY ak.id, ak.name
      ORDER BY requests DESC
      LIMIT 5
    `)
    
    // 获取Top上游账号
    const topAccounts = await db.raw<{
      email: string
      requests: number
      success_rate: number
    }[]>(`
      SELECT 
        ua.email,
        COUNT(ur.id) as requests,
        CASE 
          WHEN COUNT(ur.id) > 0 
          THEN (COUNT(CASE WHEN ur.status_code = 200 THEN 1 END) * 100.0 / COUNT(ur.id))
          ELSE 100
        END as success_rate
      FROM upstream_accounts ua
      LEFT JOIN usage_records ur ON ua.id = ur.upstream_account_id
      WHERE ua.is_active = 1
      GROUP BY ua.id, ua.email
      ORDER BY requests DESC
      LIMIT 5
    `)

    // 格式化数据
    const formattedDailyStats = dailyStats.map((stat: any) => ({
      date: formatDateShort(stat.date),
      requests: stat.requests,
      cost: Math.round(stat.cost * 100) / 100,
      successRate: Math.round(stat.success_rate * 10) / 10
    }))

    const formattedTopApiKeys = topApiKeys.map((key: any) => ({
      name: key.name,
      requests: key.requests,
      cost: Math.round(key.cost * 100) / 100
    }))

    const formattedTopAccounts = topAccounts.map((account: any) => ({
      email: account.email,
      requests: account.requests,
      successRate: Math.round(account.success_rate * 10) / 10
    }))

    const stats = {
      totalRequests,
      totalCost: Math.round(totalCost * 100) / 100,
      avgResponseTime: Math.round(avgResponseTime),
      successRate: Math.round(successRate * 10) / 10,
      dailyStats: formattedDailyStats,
      topApiKeys: formattedTopApiKeys,
      topAccounts: formattedTopAccounts
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('获取详细统计数据失败:', error)
    
    return NextResponse.json({
      error: '获取详细统计数据失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}-${day}`
}