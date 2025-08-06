'use client'

import { useMemo } from 'react'

interface CostAnalysisChartProps {
  data: {
    category: string
    amount: number
    percentage: number
  }[]
  totalCost: number
  predictions?: {
    nextDayCost: number
    nextWeekCost: number
    budgetUsage: number
    budgetRemaining: number
  }
  title: string
}

export function CostAnalysisChart({ data, totalCost, predictions, title }: CostAnalysisChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    return data.sort((a, b) => b.amount - a.amount)
  }, [data])

  const colors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ]

  if (!chartData || chartData.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-64 text-gray-500">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
            <p>暂无成本数据</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2 sm:mb-0">{title}</h3>
        <div className="text-left sm:text-right">
          <div className="text-2xl font-bold text-gray-900">${totalCost.toFixed(4)}</div>
          <div className="text-sm text-gray-500">总成本</div>
        </div>
      </div>

      {/* 成本分解和预测的网格布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 左侧：成本分解条形图 */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-800">成本分解</h4>
          <div className="space-y-3">
            {chartData.map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700 truncate">{item.category}</span>
                  </div>
                  <div className="text-right ml-4 flex-shrink-0">
                    <div className="text-sm font-semibold text-gray-900">
                      ${item.amount.toFixed(4)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${item.percentage}%`,
                      backgroundColor: colors[index % colors.length]
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：成本预测 */}
        {predictions && (
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800">成本预测与预算</h4>
            
            {/* 预测成本 */}
            <div className="space-y-3">
              <h5 className="text-sm font-medium text-gray-600">预测成本</h5>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">明日预计</span>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">
                    ${predictions.nextDayCost.toFixed(4)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">下周预计</span>
                  </div>
                  <span className="text-sm font-semibold text-green-600">
                    ${predictions.nextWeekCost.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>

            {/* 预算使用情况 */}
            <div className="space-y-3">
              <h5 className="text-sm font-medium text-gray-600">预算使用情况</h5>
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">预算使用率</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {predictions.budgetUsage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      predictions.budgetUsage > 90 ? 'bg-red-500' :
                      predictions.budgetUsage > 75 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(predictions.budgetUsage, 100)}%` }}
                  ></div>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">剩余预算</span>
                  <span className={`text-sm font-semibold ${
                    predictions.budgetRemaining > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ${predictions.budgetRemaining.toFixed(4)}
                  </span>
                </div>
                
                {predictions.budgetUsage > 90 && (
                  <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                    ⚠️ 预算即将耗尽，请注意控制成本
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 成本优化建议 - 移到底部作为全宽区域 */}
      {predictions && (
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
          <h5 className="text-sm font-medium text-blue-800 mb-2">💡 智能优化建议</h5>
          <ul className="text-sm text-blue-700 space-y-1">
            {predictions.budgetUsage > 80 && (
              <li>• 考虑调整API调用频率或使用更经济的模型</li>
            )}
            {chartData[0] && chartData[0].percentage > 60 && (
              <li>• {chartData[0].category} 占比较高，可考虑优化此部分的使用</li>
            )}
            <li>• 定期审查和清理不必要的API调用</li>
            <li>• 考虑使用缓存机制减少重复请求</li>
          </ul>
        </div>
      )}
    </div>
  )
}