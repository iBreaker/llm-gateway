'use client'

import { useMemo } from 'react'

interface UsageTrendChartProps {
  data: {
    timestamp: string
    requests: number
    tokens: number
    cost: number
    responseTime: number
    errorRate: number
  }[]
  granularity: 'hour' | 'day' | 'week' | 'month'
  title: string
}

export function UsageTrendChart({ data, granularity, title }: UsageTrendChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    return data.map(item => ({
      ...item,
      successRate: (1 - item.errorRate) * 100,
      formattedTime: formatTime(item.timestamp, granularity)
    }))
  }, [data, granularity])

  const maxValues = useMemo(() => ({
    requests: Math.max(...chartData.map(d => d.requests), 1),
    tokens: Math.max(...chartData.map(d => d.tokens), 1),
    cost: Math.max(...chartData.map(d => d.cost), 0.01),
    responseTime: Math.max(...chartData.map(d => d.responseTime), 1),
    successRate: 100
  }), [chartData])

  if (!chartData || chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p>暂无数据</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-sm text-gray-600">请求数</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">Token用量</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            <span className="text-sm text-gray-600">成本</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
            <span className="text-sm text-gray-600">响应时间</span>
          </div>
        </div>
      </div>

      {/* 简化版SVG图表 */}
      <div className="h-64 relative">
        <svg width="100%" height="100%" className="overflow-visible">
          {/* 网格线 */}
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Y轴标签 */}
          <g className="text-xs text-gray-500">
            {[0, 25, 50, 75, 100].map((percent) => (
              <g key={percent}>
                <line 
                  x1="40" 
                  y1={240 - (percent * 2)} 
                  x2="100%" 
                  y2={240 - (percent * 2)} 
                  stroke="#e5e7eb" 
                  strokeWidth="1"
                />
                <text x="35" y={245 - (percent * 2)} textAnchor="end" className="fill-gray-500">
                  {percent}%
                </text>
              </g>
            ))}
          </g>

          {/* 请求数线条 */}
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={chartData.map((d, i) => 
              `${50 + (i * (100 / Math.max(chartData.length - 1, 1)) * 9)},${240 - (d.requests / maxValues.requests * 200)}`
            ).join(' ')}
          />

          {/* Token用量线条 */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            points={chartData.map((d, i) => 
              `${50 + (i * (100 / Math.max(chartData.length - 1, 1)) * 9)},${240 - (d.tokens / maxValues.tokens * 200)}`
            ).join(' ')}
          />

          {/* 成本线条 */}
          <polyline
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            points={chartData.map((d, i) => 
              `${50 + (i * (100 / Math.max(chartData.length - 1, 1)) * 9)},${240 - (d.cost / maxValues.cost * 200)}`
            ).join(' ')}
          />

          {/* 响应时间线条 */}
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            points={chartData.map((d, i) => 
              `${50 + (i * (100 / Math.max(chartData.length - 1, 1)) * 9)},${240 - (d.responseTime / maxValues.responseTime * 200)}`
            ).join(' ')}
          />

          {/* 数据点 */}
          {chartData.map((d, i) => (
            <g key={i}>
              <circle
                cx={50 + (i * (100 / Math.max(chartData.length - 1, 1)) * 9)}
                cy={240 - (d.requests / maxValues.requests * 200)}
                r="3"
                fill="#3b82f6"
                className="hover:r-4 transition-all cursor-pointer"
              >
                <title>{`${d.formattedTime}: ${d.requests} 请求`}</title>
              </circle>
            </g>
          ))}
        </svg>
      </div>

      {/* X轴时间标签 */}
      <div className="flex justify-between mt-4 text-xs text-gray-500">
        {chartData.filter((_, i) => i % Math.max(Math.floor(chartData.length / 6), 1) === 0).map((d, i) => (
          <span key={i}>{d.formattedTime}</span>
        ))}
      </div>

      {/* 统计摘要 */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-blue-600 font-semibold">
            {chartData.reduce((sum, d) => sum + d.requests, 0).toLocaleString()}
          </div>
          <div className="text-gray-600">总请求数</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-green-600 font-semibold">
            {formatNumber(chartData.reduce((sum, d) => sum + d.tokens, 0))}
          </div>
          <div className="text-gray-600">总Token数</div>
        </div>
        <div className="text-center p-3 bg-purple-50 rounded-lg">
          <div className="text-purple-600 font-semibold">
            ${chartData.reduce((sum, d) => sum + d.cost, 0).toFixed(4)}
          </div>
          <div className="text-gray-600">总成本</div>
        </div>
        <div className="text-center p-3 bg-orange-50 rounded-lg">
          <div className="text-orange-600 font-semibold">
            {Math.round(chartData.reduce((sum, d) => sum + d.responseTime, 0) / chartData.length)}ms
          </div>
          <div className="text-gray-600">平均响应时间</div>
        </div>
      </div>
    </div>
  )
}

function formatTime(timestamp: string, granularity: string): string {
  const date = new Date(timestamp)
  
  switch (granularity) {
    case 'hour':
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    case 'day':
      return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
    case 'week':
      return `第${Math.ceil(date.getDate() / 7)}周`
    case 'month':
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' })
    default:
      return date.toLocaleDateString('zh-CN')
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toLocaleString()
}