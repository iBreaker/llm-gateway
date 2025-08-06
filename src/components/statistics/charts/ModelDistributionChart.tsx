'use client'

import { useMemo } from 'react'

interface ModelDistributionChartProps {
  data: {
    model: string
    requests: number
    tokens: number
    cost: number
    avgResponseTime: number
    successRate: number
  }[]
  title: string
}

export function ModelDistributionChart({ data, title }: ModelDistributionChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    const totalRequests = data.reduce((sum, item) => sum + item.requests, 0)
    const totalTokens = data.reduce((sum, item) => sum + item.tokens, 0)
    const totalCost = data.reduce((sum, item) => sum + item.cost, 0)
    
    return data
      .map(item => ({
        ...item,
        requestsPercentage: totalRequests > 0 ? (item.requests / totalRequests * 100) : 0,
        tokensPercentage: totalTokens > 0 ? (item.tokens / totalTokens * 100) : 0,
        costPercentage: totalCost > 0 ? (item.cost / totalCost * 100) : 0
      }))
      .sort((a, b) => b.requests - a.requests)
  }, [data])

  const colors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
  ]

  if (!chartData || chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            <p>暂无模型数据</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>
      
      {/* 饼状图和图例 */}
      <div className="flex flex-col lg:flex-row items-center">
        {/* 简化版饼状图 */}
        <div className="relative w-48 h-48 mb-6 lg:mb-0 lg:mr-8">
          <svg width="192" height="192" className="transform -rotate-90">
            {chartData.map((item, index) => {
              let cumulativePercentage = 0
              for (let i = 0; i < index; i++) {
                cumulativePercentage += chartData[i].requestsPercentage
              }
              
              const startAngle = (cumulativePercentage / 100) * 360
              const endAngle = ((cumulativePercentage + item.requestsPercentage) / 100) * 360
              const angle = endAngle - startAngle
              
              if (angle < 1) return null // 忽略太小的片段
              
              const startAngleRad = (startAngle * Math.PI) / 180
              const endAngleRad = (endAngle * Math.PI) / 180
              
              const x1 = 96 + 80 * Math.cos(startAngleRad)
              const y1 = 96 + 80 * Math.sin(startAngleRad)
              const x2 = 96 + 80 * Math.cos(endAngleRad)
              const y2 = 96 + 80 * Math.sin(endAngleRad)
              
              const largeArcFlag = angle > 180 ? 1 : 0
              
              return (
                <path
                  key={index}
                  d={`M 96 96 L ${x1} ${y1} A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                  fill={colors[index % colors.length]}
                  className="hover:opacity-80 cursor-pointer"
                >
                  <title>{`${item.model}: ${item.requestsPercentage.toFixed(1)}%`}</title>
                </path>
              )
            })}
          </svg>
          
          {/* 中心文字 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-sm text-gray-500">总计</div>
              <div className="text-lg font-semibold">
                {chartData.reduce((sum, item) => sum + item.requests, 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-400">请求</div>
            </div>
          </div>
        </div>
        
        {/* 图例和详细信息 */}
        <div className="flex-1 space-y-3">
          {chartData.map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: colors[index % colors.length] }}
                ></div>
                <div>
                  <div className="font-medium text-gray-900">{item.model}</div>
                  <div className="text-sm text-gray-500">
                    {item.requestsPercentage.toFixed(1)}% 请求量
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">
                  {item.requests.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  {item.successRate.toFixed(1)}% 成功率
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 详细统计表格 */}
      <div className="mt-8 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                模型
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                请求数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Token用量
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                成本
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                平均响应时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                成功率
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {chartData.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    ></div>
                    <div className="text-sm font-medium text-gray-900">{item.model}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{item.requests.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">{item.requestsPercentage.toFixed(1)}%</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{formatNumber(item.tokens)}</div>
                  <div className="text-sm text-gray-500">{item.tokensPercentage.toFixed(1)}%</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">${item.cost.toFixed(4)}</div>
                  <div className="text-sm text-gray-500">{item.costPercentage.toFixed(1)}%</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{Math.round(item.avgResponseTime)}ms</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="text-sm text-gray-900">{item.successRate.toFixed(1)}%</div>
                    <div className={`ml-2 w-2 h-2 rounded-full ${
                      item.successRate >= 99 ? 'bg-green-400' :
                      item.successRate >= 95 ? 'bg-yellow-400' : 'bg-red-400'
                    }`}></div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
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