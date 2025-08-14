'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { useState, useEffect } from 'react'
import { apiClient } from '../../utils/api'

interface TokenTrendPoint {
  date: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  requestsCount: number
  costUsd: number
}

interface ApiKeyTokenTrend {
  apiKeyId: number
  apiKeyName: string
  trendData: TokenTrendPoint[]
}

interface ApiKeyTokenChartProps {
  timeRange: string
  onError?: (error: string) => void
}

// 颜色映射
const COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#6b7280', // gray-500
  '#14b8a6', // teal-500
]

export default function ApiKeyTokenChart({ timeRange, onError }: ApiKeyTokenChartProps) {
  const [data, setData] = useState<ApiKeyTokenTrend[]>([])
  const [loading, setLoading] = useState(true)
  const [chartData, setChartData] = useState<any[]>([])

  useEffect(() => {
    fetchData()
  }, [timeRange])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      const apiKeyTrends: ApiKeyTokenTrend[] = await apiClient.get(`/api/stats/api-key-token-trends?range=${timeRange}`)
      setData(apiKeyTrends)

      // 转换数据格式用于图表显示
      transformDataForChart(apiKeyTrends)

    } catch (error) {
      console.error('获取API Key Token走势失败:', error)
      onError?.(error instanceof Error ? error.message : '获取数据失败')
    } finally {
      setLoading(false)
    }
  }

  const transformDataForChart = (apiKeyTrends: ApiKeyTokenTrend[]) => {
    // 收集所有日期
    const allDates = new Set<string>()
    apiKeyTrends.forEach(trend => {
      trend.trendData.forEach(point => {
        allDates.add(point.date)
      })
    })

    const sortedDates = Array.from(allDates).sort()

    // 为每个日期创建数据点
    const transformedData = sortedDates.map(date => {
      const dataPoint: any = { date }

      apiKeyTrends.forEach(trend => {
        const point = trend.trendData.find(p => p.date === date)
        dataPoint[`${trend.apiKeyName}`] = point?.totalTokens || 0
      })

      return dataPoint
    })

    setChartData(transformedData)
  }

  const formatTooltip = (value: any, name: string) => {
    if (typeof value === 'number') {
      return [value.toLocaleString(), `${name} Token使用量`]
    }
    return [value, name]
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('zh-CN', { 
        month: 'short', 
        day: 'numeric' 
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">API Key Token使用走势</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (data.length === 0 || chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">API Key Token使用走势</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-sm">暂无数据</div>
            <div className="text-xs mt-1">请确保API Key有使用记录</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">API Key Token使用走势</h3>
          <p className="text-sm text-gray-600 mt-1">
            {data.length} 个API Key的Token消耗趋势
          </p>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              className="text-sm"
            />
            <YAxis 
              tickFormatter={(value) => value.toLocaleString()}
              className="text-sm"
            />
            <Tooltip 
              formatter={formatTooltip}
              labelFormatter={(label) => `日期: ${formatDate(label)}`}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
            />
            <Legend />
            
            {data.map((trend, index) => (
              <Line
                key={trend.apiKeyId}
                type="monotone"
                dataKey={trend.apiKeyName}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 数据摘要 */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map((trend, index) => {
          const totalTokens = trend.trendData.reduce((sum, point) => sum + point.totalTokens, 0)
          const totalRequests = trend.trendData.reduce((sum, point) => sum + point.requestsCount, 0)
          const totalCost = trend.trendData.reduce((sum, point) => sum + point.costUsd, 0)

          return (
            <div key={trend.apiKeyId} className="p-3 bg-gray-50 rounded-md">
              <div className="flex items-center space-x-2 mb-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div className="font-medium text-sm text-gray-900 truncate">
                  {trend.apiKeyName}
                </div>
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div>Token: {totalTokens.toLocaleString()}</div>
                <div>请求: {totalRequests.toLocaleString()}</div>
                <div>成本: ${totalCost.toFixed(4)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}