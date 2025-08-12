'use client'

import { useEffect, useState } from 'react'
import { StatCard } from './StatCard'
import { TimeRangeSelector } from './TimeRangeSelector'
import { FilterPanel } from './FilterPanel'
import { UsageTrendChart } from './charts/UsageTrendChart'
import { ModelDistributionChart } from './charts/ModelDistributionChart'
import { CostAnalysisChart } from './charts/CostAnalysisChart'
import { RealTimeMetrics } from './RealTimeMetrics'
import { InsightPanel } from './InsightPanel'
import { ExportButton } from './ExportButton'
import { AccountPerformanceTable } from './AccountPerformanceTable'
import { apiClient } from '../../utils/api'

interface StatisticsDashboardProps {
  userId?: string
}

export interface DashboardData {
  overview: {
    totalRequests: number
    successRate: number
    avgResponseTime: number
    totalCost: number
    activeAccounts: number
    period: string
  }
  usage: {
    requestsByProvider: Record<string, number>
    requestsByModel: Record<string, number>
    tokensConsumed: number
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    avgTokensPerSecond: number
    cacheHitRate: number
    dailyUsage: {
      date: string
      requests: number
      tokens: number
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
    }[]
  }
  performance: {
    avgResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    errorRate: number
    responseTimeTrend: {
      timestamp: string
      avgTime: number
    }[]
  }
  costs: {
    totalCost: number
    costByProvider: Record<string, number>
    costByModel: Record<string, number>
    dailyCosts: {
      date: string
      cost: number
    }[]
  }
  charts: {
    requestVolume: {
      timestamp: string
      value: number
    }[]
    responseTimes: {
      timestamp: string
      value: number
    }[]
    errorRates: {
      timestamp: string
      value: number
    }[]
    costs: {
      timestamp: string
      value: number
    }[]
  }
}

export interface FilterOptions {
  dateRange: {
    start: string
    end: string
    preset: string
  }
  models: string[]
  accounts: string[]
  status: string[]
  granularity: 'hour' | 'day' | 'week' | 'month'
}

export default function StatisticsDashboard({ userId }: StatisticsDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterOptions>({
    dateRange: {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
      preset: '7d'
    },
    models: [],
    accounts: [],
    status: [],
    granularity: 'day'
  })
  const [viewMode, setViewMode] = useState<'overview' | 'detailed' | 'realtime'>('overview')

  // 获取统计数据
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        start: filters.dateRange.start,
        end: filters.dateRange.end,
        granularity: filters.granularity,
        ...(filters.models.length > 0 && { models: filters.models.join(',') }),
        ...(filters.accounts.length > 0 && { accounts: filters.accounts.join(',') }),
        ...(filters.status.length > 0 && { status: filters.status.join(',') })
      })
      
      const dashboardData = await apiClient.get<DashboardData>(`/api/stats/detailed?${params}`)
      setData(dashboardData)
    } catch (err: any) {
      console.error('获取统计数据失败:', err)
      setError(err.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  // 初始加载和过滤器变化时重新加载
  useEffect(() => {
    fetchData()
  }, [filters]) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动刷新（实时模式）
  useEffect(() => {
    if (viewMode === 'realtime') {
      const interval = setInterval(fetchData, 30000) // 30秒刷新
      return () => clearInterval(interval)
    }
  }, [viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="animate-pulse space-y-6">
            {/* 加载骨架屏 */}
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white p-4 rounded-lg shadow">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow h-80"></div>
              <div className="bg-white p-6 rounded-lg shadow h-80"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">加载失败</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={fetchData}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* 页头 */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">数据分析中心</h1>
              <p className="mt-1 text-sm text-gray-600">
                深入了解您的API使用情况、成本分析和性能指标
              </p>
            </div>
            <div className="mt-4 sm:mt-0 flex items-center space-x-3">
              {/* 视图模式切换 */}
              <div className="flex rounded-lg border border-gray-200 bg-white p-1">
                {[
                  { value: 'overview', label: '概览', icon: '📊' },
                  { value: 'detailed', label: '详细', icon: '📈' },
                  { value: 'realtime', label: '实时', icon: '⚡' }
                ].map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => setViewMode(mode.value as any)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      viewMode === mode.value
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    <span className="mr-1">{mode.icon}</span>
                    {mode.label}
                  </button>
                ))}
              </div>
              
              <ExportButton data={data} filters={filters} />
            </div>
          </div>
        </div>

        {/* 过滤和时间选择器 */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <TimeRangeSelector 
              value={filters.dateRange}
              onChange={(dateRange) => setFilters(prev => ({ ...prev, dateRange }))}
            />
            <FilterPanel 
              filters={filters}
              onChange={setFilters}
              availableModels={data?.usage?.requestsByModel ? Object.keys(data.usage.requestsByModel) : []}
              availableAccounts={data?.usage?.requestsByProvider ? Object.keys(data.usage.requestsByProvider).map(name => ({ id: name, name })) : []}
            />
          </div>
        </div>

        {/* 实时监控模式 */}
        {viewMode === 'realtime' && (
          <RealTimeMetrics data={data} />
        )}

        {/* 关键指标卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard
            title="总请求数"
            value={data?.overview?.totalRequests || 0}
            change={calculateChange(data?.charts?.requestVolume, 'value')}
            trend={getTrend(data?.charts?.requestVolume, 'value')}
            icon="📊"
          />
          <StatCard
            title="Token用量"
            value={formatNumber(data?.usage?.tokensConsumed || 0)}
            subtitle={`平均 ${Math.round((data?.usage?.tokensConsumed || 0) / Math.max(data?.overview?.totalRequests || 1, 1))} /请求`}
            change={calculateChange(data?.usage?.dailyUsage?.map(d => ({timestamp: d.date, value: d.tokens})), 'value')}
            trend={getTrend(data?.usage?.dailyUsage?.map(d => ({timestamp: d.date, value: d.tokens})), 'value')}
            icon="🎯"
          />
          <StatCard
            title="成功率"
            value={`${(data?.overview?.successRate || 0).toFixed(1)}%`}
            change={0} // TODO: 需要计算成功率变化
            trend={'stable'}
            icon="✅"
          />
          <StatCard
            title="平均响应时间"
            value={`${Math.round(data?.overview?.avgResponseTime || 0)}ms`}
            change={calculateChange(data?.charts?.responseTimes, 'value')}
            trend={getTrend(data?.charts?.responseTimes, 'value', true)} // 响应时间越低越好
            icon="⚡"
          />
          <StatCard
            title="总成本"
            value={`$${(data?.overview?.totalCost || 0).toFixed(4)}`}
            subtitle={`预计月成本 $${((data?.overview?.totalCost || 0) * 30 / Math.max(getDaysDiff(filters.dateRange), 1)).toFixed(2)}`}
            change={calculateChange(data?.charts?.costs, 'value')}
            trend={getTrend(data?.charts?.costs, 'value')}
            icon="💰"
          />
        </div>

        {/* 主要图表区域 */}
        <div className="space-y-6 mb-6">
          {/* 使用趋势图表 - 全宽 */}
          <UsageTrendChart 
            data={convertToTimeSeriesData(data)}
            granularity={filters.granularity}
            title="使用趋势分析"
          />
          
          {/* 成本分析图表 - 全宽 */}
          <CostAnalysisChart 
            data={data?.costs?.costByProvider ? Object.entries(data.costs.costByProvider).map(([category, amount]) => ({
              category,
              amount,
              percentage: (amount / (data?.costs?.totalCost || 1)) * 100
            })) : []}
            totalCost={data?.costs?.totalCost || 0}
            predictions={{
              nextDayCost: (data?.costs?.totalCost || 0) / Math.max(getDaysDiff(filters.dateRange), 1),
              nextWeekCost: (data?.costs?.totalCost || 0) / Math.max(getDaysDiff(filters.dateRange), 1) * 7,
              budgetUsage: 0,
              budgetRemaining: 0
            }}
            title="成本分析与预测"
          />
        </div>

        {/* 详细分析区域 */}
        {viewMode === 'detailed' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <ModelDistributionChart 
              data={data?.usage?.requestsByModel ? Object.entries(data.usage.requestsByModel).map(([model, requests]) => ({
                model,
                requests,
                tokens: 0, // TODO: 需要添加按模型的token统计
                cost: 0, // TODO: 需要添加按模型的成本统计
                avgResponseTime: 0,
                successRate: 0
              })) : []}
              title="模型使用分布"
            />
            <div className="lg:col-span-2">
              <AccountPerformanceTable accounts={data?.usage?.requestsByProvider ? Object.entries(data.usage.requestsByProvider).map(([name, requests]) => ({
                id: name,
                name,
                type: name,
                requests,
                healthScore: 100,
                avgResponseTime: data?.performance?.avgResponseTime || 0,
                successRate: data?.overview?.successRate || 0,
                lastUsed: new Date().toISOString()
              })) : []} />
            </div>
          </div>
        )}

        {/* Token使用详情 */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Token使用分析</h2>
            <p className="text-sm text-gray-600 mt-1">详细的Token消耗和缓存统计</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <TokenStatCard
                title="总Token消耗"
                value={data?.usage?.tokensConsumed || 0}
                total={data?.usage?.tokensConsumed || 0}
                color="blue"
                subtitle="全部Token使用量"
              />
              <TokenStatCard
                title="输入Token"
                value={data?.usage?.inputTokens || 0}
                total={data?.usage?.tokensConsumed || 0}
                color="green"
                subtitle="提示词Token"
              />
              <TokenStatCard
                title="输出Token"
                value={data?.usage?.outputTokens || 0}
                total={data?.usage?.tokensConsumed || 0}
                color="orange"
                subtitle="生成内容Token"
              />
              <TokenStatCard
                title="缓存Token"
                value={(data?.usage?.cacheReadTokens || 0) + (data?.usage?.cacheCreationTokens || 0)}
                total={data?.usage?.tokensConsumed || 0}
                color="purple"
                subtitle="缓存相关Token"
              />
            </div>
            
            {/* 缓存效率分析 */}
            {((data?.usage?.cacheReadTokens || 0) > 0 || (data?.usage?.cacheCreationTokens || 0) > 0) && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">缓存效率分析</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-800">缓存读取Token</span>
                      <span className="text-xs text-green-600">节省90%费用</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatNumber(data?.usage?.cacheReadTokens || 0)}
                    </p>
                    <p className="text-xs text-green-500 mt-1">
                      节省约 ${((data?.usage?.cacheReadTokens || 0) * 0.003 * 0.9 / 1000).toFixed(4)}
                    </p>
                  </div>
                  
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-yellow-800">缓存创建Token</span>
                      <span className="text-xs text-yellow-600">增加25%费用</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-600">
                      {formatNumber(data?.usage?.cacheCreationTokens || 0)}
                    </p>
                    <p className="text-xs text-yellow-500 mt-1">
                      额外费用 ${((data?.usage?.cacheCreationTokens || 0) * 0.003 * 0.25 / 1000).toFixed(4)}
                    </p>
                  </div>
                  
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">缓存命中率</span>
                      <span className="text-xs text-blue-600">效率指标</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">
                      {data?.usage?.cacheHitRate ? (data.usage.cacheHitRate * 100).toFixed(1) : '0.0'}%
                    </p>
                    <p className="text-xs text-blue-500 mt-1">
                      {(data?.usage?.cacheHitRate || 0) > 0.7 ? '优秀' : (data?.usage?.cacheHitRate || 0) > 0.4 ? '良好' : '待优化'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 性能指标 */}
            <div className="border-t pt-6 mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">性能指标</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800">平均Token生成速度</span>
                    <span className="text-xs text-gray-600">tokens/秒</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-600">
                    {data?.usage?.avgTokensPerSecond ? data.usage.avgTokensPerSecond.toFixed(1) : '0.0'}
                  </p>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800">平均每请求Token</span>
                    <span className="text-xs text-gray-600">效率指标</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-600">
                    {Math.round((data?.usage?.tokensConsumed || 0) / Math.max(data?.overview?.totalRequests || 1, 1))}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 工具函数
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toLocaleString()
}

function calculateChange(timeSeriesData: any[] | undefined, field: string): number {
  if (!timeSeriesData || timeSeriesData.length < 2) return 0
  
  const recent = timeSeriesData.slice(-7).reduce((sum, item) => sum + (item[field] || 0), 0)
  const previous = timeSeriesData.slice(-14, -7).reduce((sum, item) => sum + (item[field] || 0), 0)
  
  if (previous === 0) return recent > 0 ? 100 : 0
  return ((recent - previous) / previous) * 100
}

function getTrend(timeSeriesData: any[] | undefined, field: string, inverse = false): 'up' | 'down' | 'stable' {
  const change = calculateChange(timeSeriesData, field)
  const threshold = 5 // 5% 变化阈值
  
  if (Math.abs(change) < threshold) return 'stable'
  
  const isUp = change > 0
  return inverse ? (isUp ? 'down' : 'up') : (isUp ? 'up' : 'down')
}

function calculateSuccessRateChange(timeSeriesData: any[] | undefined): number {
  if (!timeSeriesData || timeSeriesData.length < 2) return 0
  
  const recentData = timeSeriesData.slice(-7)
  const previousData = timeSeriesData.slice(-14, -7)
  
  const recentRate = recentData.reduce((sum, item) => sum + (1 - (item.errorRate || 0)), 0) / recentData.length
  const previousRate = previousData.reduce((sum, item) => sum + (1 - (item.errorRate || 0)), 0) / previousData.length
  
  if (previousRate === 0) return recentRate > 0 ? 100 : 0
  return ((recentRate - previousRate) / previousRate) * 100
}

function getSuccessRateTrend(timeSeriesData: any[] | undefined): 'up' | 'down' | 'stable' {
  const change = calculateSuccessRateChange(timeSeriesData)
  return Math.abs(change) < 1 ? 'stable' : (change > 0 ? 'up' : 'down')
}

function getDaysDiff(dateRange: { start: string; end: string }): number {
  const start = new Date(dateRange.start)
  const end = new Date(dateRange.end)
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

// 转换新API数据格式为图表组件期望的格式
function convertToTimeSeriesData(data: DashboardData | null): {
  timestamp: string
  requests: number
  tokens: number
  cost: number
  responseTime: number
  errorRate: number
}[] {
  if (!data?.usage?.dailyUsage || data.usage.dailyUsage.length === 0) {
    return []
  }

  return data.usage.dailyUsage.map((dailyItem, index) => ({
    timestamp: `${dailyItem.date}T00:00:00Z`,
    requests: dailyItem.requests,
    tokens: dailyItem.tokens,
    cost: data.costs?.dailyCosts?.[index]?.cost || 0,
    responseTime: data.performance?.responseTimeTrend?.[index]?.avgTime || 0,
    errorRate: data.performance?.errorRate / 100 || 0
  }))
}

// Token统计卡片子组件
interface TokenStatCardProps {
  title: string
  value: number
  total: number
  color: 'blue' | 'green' | 'orange' | 'purple'
  subtitle?: string
}

function TokenStatCard({ title, value, total, color, subtitle }: TokenStatCardProps) {
  const percentage = total > 0 ? (value / total * 100).toFixed(1) : '0.0'
  
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-orange-600 bg-orange-50',
    purple: 'text-purple-600 bg-purple-50'
  }
  
  return (
    <div className={`p-4 rounded-lg ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        <span className="text-sm font-semibold">{percentage}%</span>
      </div>
      <div className="text-2xl font-bold">{formatNumber(value)}</div>
      <div className="text-xs text-gray-500 mt-1">
        {subtitle || `占总量 ${percentage}%`}
      </div>
    </div>
  )
}