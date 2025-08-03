'use client'

import { useEffect, useState } from 'react'

interface UsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  totalCost: number
  // Token统计
  totalTokens: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  averageTokensPerRequest: number
  // 按类型分组
  requestsByModel: { model: string; count: number; tokens: number; cost: number }[]
  requestsByDate: { date: string; count: number; tokens: number; cost: number }[]
  // 账号效率
  accountStats: {
    id: string
    name: string
    type: string
    requestCount: number
    totalTokens: number
    totalCost: number
    averageTokensPerRequest: number
    averageCostPerRequest: number
  }[]
}

export default function StatsPage() {
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('7d')

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`/api/stats/detailed?range=${timeRange}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error('获取统计数据失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [timeRange])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">使用统计</h1>
          <p className="text-sm text-zinc-600">查看 API 使用情况和性能指标</p>
        </div>
        <select 
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-2 border border-zinc-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
        >
          <option value="1d">最近 1 天</option>
          <option value="7d">最近 7 天</option>
          <option value="30d">最近 30 天</option>
          <option value="90d">最近 90 天</option>
        </select>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="总请求数"
          value={stats?.totalRequests || 0}
        />
        <StatCard
          title="Token总量"
          value={`${(stats?.totalTokens || 0).toLocaleString()}`}
          subtitle={`平均 ${(stats?.averageTokensPerRequest || 0).toFixed(0)} /请求`}
        />
        <StatCard
          title="成功率"
          value={`${stats?.totalRequests ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1) : 0}%`}
        />
        <StatCard
          title="平均响应时间"
          value={`${stats?.averageResponseTime || 0}ms`}
        />
        <StatCard
          title="总费用"
          value={`$${(stats?.totalCost || 0).toFixed(4)}`}
          subtitle={`平均 $${stats?.totalRequests ? (stats.totalCost / stats.totalRequests).toFixed(4) : '0.0000'} /请求`}
        />
      </div>

      {/* Token详细统计 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        <div className="p-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">Token使用详情</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">输入Token</p>
              <p className="text-lg font-bold text-blue-600 mt-1">{(stats?.totalInputTokens || 0).toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {stats?.totalTokens ? ((stats.totalInputTokens / stats.totalTokens) * 100).toFixed(1) : 0}% 占比
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">输出Token</p>
              <p className="text-lg font-bold text-green-600 mt-1">{(stats?.totalOutputTokens || 0).toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {stats?.totalTokens ? ((stats.totalOutputTokens / stats.totalTokens) * 100).toFixed(1) : 0}% 占比
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">缓存创建Token</p>
              <p className="text-lg font-bold text-orange-600 mt-1">{(stats?.totalCacheCreationTokens || 0).toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {stats?.totalTokens ? ((stats.totalCacheCreationTokens / stats.totalTokens) * 100).toFixed(1) : 0}% 占比
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">缓存读取Token</p>
              <p className="text-lg font-bold text-purple-600 mt-1">{(stats?.totalCacheReadTokens || 0).toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {stats?.totalTokens ? ((stats.totalCacheReadTokens / stats.totalTokens) * 100).toFixed(1) : 0}% 占比
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 按模型分布 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">按模型分布</h2>
          </div>
          <div className="p-4">
            {stats?.requestsByModel.length ? (
              <div className="space-y-3">
                {stats.requestsByModel.map((item, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-700 font-medium">{item.model}</span>
                      <span className="text-sm font-medium text-zinc-900">{item.count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{item.tokens?.toLocaleString() || 0} tokens</span>
                      <span>${(item.cost || 0).toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">暂无数据</p>
            )}
          </div>
        </div>

        {/* 请求趋势 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">请求趋势</h2>
          </div>
          <div className="p-4">
            {stats?.requestsByDate.length ? (
              <div className="space-y-3">
                {stats.requestsByDate.slice(-7).map((item, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-zinc-700">
                        {new Date(item.date).toLocaleDateString()}
                      </span>
                      <span className="text-sm font-medium text-zinc-900">{item.count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>{item.tokens?.toLocaleString() || 0} tokens</span>
                      <span>${(item.cost || 0).toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">暂无数据</p>
            )}
          </div>
        </div>

        {/* 账号效率统计 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">账号效率</h2>
          </div>
          <div className="p-4">
            {stats?.accountStats.length ? (
              <div className="space-y-4">
                {stats.accountStats.map((account, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-zinc-900">{account.name}</span>
                        <span className="text-xs text-zinc-500 ml-2">({account.type})</span>
                      </div>
                      <span className="text-xs text-zinc-500">{account.requestCount} 请求</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500">平均Token:</span>
                        <span className="font-medium ml-1">{account.averageTokensPerRequest.toFixed(0)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">平均成本:</span>
                        <span className="font-medium ml-1">${account.averageCostPerRequest.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">暂无数据</p>
            )}
          </div>
        </div>
      </div>

      {/* 详细指标 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        <div className="p-4 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900">详细指标</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">成功请求</p>
              <p className="text-lg font-bold text-green-600 mt-1">{stats?.successfulRequests.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">失败请求</p>
              <p className="text-lg font-bold text-red-600 mt-1">{stats?.failedRequests.toLocaleString() || 0}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">错误率</p>
              <p className="text-lg font-bold text-zinc-900 mt-1">
                {stats?.totalRequests ? ((stats.failedRequests / stats.totalRequests) * 100).toFixed(2) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
}

function StatCard({ title, value, subtitle }: StatCardProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-sm p-4">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
        {subtitle && (
          <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
        )}
      </div>
    </div>
  )
}