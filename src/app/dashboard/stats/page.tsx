'use client'

import DashboardLayout from '@/components/dashboard/DashboardLayout'
import StatCard from '@/components/ui/StatCard'
import { useState, useEffect } from 'react'

interface DailyStat {
  date: string
  requests: number
  cost: number
  successRate: number
}

interface TopApiKey {
  name: string
  requests: number
  cost: number
}

interface TopAccount {
  email: string
  requests: number
  successRate: number
}

interface DetailedStats {
  totalRequests: number
  totalCost: number
  avgResponseTime: number
  successRate: number
  dailyStats: DailyStat[]
  topApiKeys: TopApiKey[]
  topAccounts: TopAccount[]
}

export default function StatsPage() {
  const [stats, setStats] = useState<DetailedStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/dashboard/stats/detailed')
        if (!response.ok) {
          throw new Error('获取统计数据失败')
        }
        const data = await response.json()
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知错误')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">加载中...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">错误：{error}</div>
        </div>
      </DashboardLayout>
    )
  }

  if (!stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">暂无统计数据</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">使用统计</h1>
          <p className="text-gray-600 mt-2">查看详细的使用情况和成本分析</p>
        </div>

        {/* 总览统计 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="总请求数" 
            value={stats.totalRequests.toLocaleString()} 
            color="blue"
          />
          <StatCard 
            title="总成本" 
            value={`$${stats.totalCost.toFixed(2)}`} 
            color="red"
          />
          <StatCard 
            title="平均响应时间" 
            value={`${stats.avgResponseTime}ms`} 
            color="orange"
          />
          <StatCard 
            title="成功率" 
            value={`${stats.successRate}%`} 
            color="green"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 每日趋势图 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">7天请求趋势</h2>
            <div className="space-y-4">
              {stats.dailyStats.length === 0 ? (
                <div className="text-center text-gray-500 py-4">暂无数据</div>
              ) : (
                stats.dailyStats.map((stat, index) => {
                  const maxRequests = Math.max(...stats.dailyStats.map(s => s.requests), 1)
                  return (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{stat.date}</span>
                      <div className="flex items-center space-x-4">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${(stat.requests / maxRequests) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-16 text-right">
                          {stat.requests}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 成本趋势 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">7天成本趋势</h2>
            <div className="space-y-4">
              {stats.dailyStats.length === 0 ? (
                <div className="text-center text-gray-500 py-4">暂无数据</div>
              ) : (
                stats.dailyStats.map((stat, index) => {
                  const maxCost = Math.max(...stats.dailyStats.map(s => s.cost), 1)
                  return (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{stat.date}</span>
                      <div className="flex items-center space-x-4">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${(stat.cost / maxCost) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900 w-16 text-right">
                          ${stat.cost.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top API Keys */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top API 密钥</h2>
            <div className="space-y-4">
              {stats.topApiKeys.length === 0 ? (
                <div className="text-center text-gray-500 py-4">暂无数据</div>
              ) : (
                stats.topApiKeys.map((apiKey, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{apiKey.name}</p>
                      <p className="text-sm text-gray-500">{apiKey.requests} 请求</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">${apiKey.cost.toFixed(2)}</p>
                      <p className="text-sm text-gray-500">成本</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top 账号 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 上游账号</h2>
            <div className="space-y-4">
              {stats.topAccounts.length === 0 ? (
                <div className="text-center text-gray-500 py-4">暂无数据</div>
              ) : (
                stats.topAccounts.map((account, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{account.email}</p>
                      <p className="text-sm text-gray-500">{account.requests} 请求</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{account.successRate}%</p>
                      <p className="text-sm text-gray-500">成功率</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 详细表格 */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">详细统计</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">请求数</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成本</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stats.dailyStats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                      暂无统计数据
                    </td>
                  </tr>
                ) : (
                  stats.dailyStats.map((stat, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 text-sm text-gray-900">2024-{stat.date}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{stat.requests.toLocaleString()}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">${stat.cost.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{stat.successRate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

// StatCard moved to shared component