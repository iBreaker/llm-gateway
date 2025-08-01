import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/server-init'

export async function GET() {
  try {
    const db = await getDatabase()
    
    // 从数据库获取真实数据
    const [
      totalRequests,
      activeAccounts, 
      apiKeysCount,
      avgResponseTime,
      totalCost,
      successRequests
    ] = await Promise.all([
      // 总请求数
      db.count('usage_records'),
      
      // 活跃账号数
      db.raw<{ count: number }>(`
        SELECT COUNT(*) as count FROM upstream_accounts WHERE is_active = 1
      `).then(result => result[0]?.count || 0),
      
      // API 密钥数量
      db.raw<{ count: number }>(`
        SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1
      `).then(result => result[0]?.count || 0),
      
      // 平均响应时间
      db.raw<{ avg_response_time: number }>(`
        SELECT AVG(response_time) as avg_response_time 
        FROM usage_records 
        WHERE response_time IS NOT NULL
      `).then(result => result[0]?.avg_response_time || 0),
      
      // 总成本
      db.raw<{ total_cost: number }>(`
        SELECT SUM(cost) as total_cost 
        FROM usage_records
      `).then(result => result[0]?.total_cost || 0),
      
      // 成功请求数
      db.raw<{ count: number }>(`
        SELECT COUNT(*) as count FROM usage_records WHERE status_code = 200
      `).then(result => result[0]?.count || 0)
    ])
    
    // 计算成功率
    const successRate = totalRequests > 0 ? (successRequests / totalRequests * 100) : 100
    
    const stats = {
      totalRequests,
      activeAccounts,
      apiKeysCount,
      successRate: Math.round(successRate * 10) / 10, // 保留一位小数
      avgResponseTime: Math.round(avgResponseTime),
      totalCost: Math.round(totalCost * 100) / 100 // 保留两位小数
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error('获取统计数据失败:', error)
    
    return NextResponse.json({
      error: '获取统计数据失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}