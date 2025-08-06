'use client'

interface InsightPanelProps {
  insights: {
    type: 'warning' | 'info' | 'success' | 'error'
    title: string
    description: string
    value?: string
    trend?: 'up' | 'down' | 'stable'
  }[]
}

export function InsightPanel({ insights }: InsightPanelProps) {
  if (!insights || insights.length === 0) {
    return null
  }

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return '⚠️'
      case 'error':
        return '❌'
      case 'success':
        return '✅'
      case 'info':
        return 'ℹ️'
      default:
        return 'ℹ️'
    }
  }

  const getInsightStyles = (type: string) => {
    switch (type) {
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800'
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return '📈'
      case 'down':
        return '📉'
      case 'stable':
        return '➡️'
      default:
        return null
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">智能洞察</h3>
        <span className="text-sm text-gray-500">基于AI分析生成</span>
      </div>

      <div className="space-y-4">
        {insights.map((insight, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${getInsightStyles(insight.type)}`}
          >
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 text-lg">
                {getInsightIcon(insight.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">{insight.title}</h4>
                  {insight.value && (
                    <div className="flex items-center space-x-1">
                      {insight.trend && (
                        <span className="text-sm">{getTrendIcon(insight.trend)}</span>
                      )}
                      <span className="text-sm font-semibold">{insight.value}</span>
                    </div>
                  )}
                </div>
                <p className="text-sm mt-1 opacity-90">{insight.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 智能建议区域 */}
      <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0 text-lg">🤖</div>
          <div>
            <h4 className="text-sm font-medium text-purple-800 mb-2">AI 智能建议</h4>
            <div className="text-sm text-purple-700 space-y-2">
              <p>• 根据当前使用模式，建议在高峰时段增加账号池容量以提升响应速度</p>
              <p>• 检测到某些模型成本效率较低，可考虑优化模型选择策略</p>
              <p>• 建议设置成本告警阈值，避免意外超支</p>
            </div>
            <div className="mt-3 flex items-center space-x-2">
              <button className="text-xs bg-purple-600 text-white px-3 py-1 rounded-full hover:bg-purple-700 transition-colors">
                查看详细建议
              </button>
              <button className="text-xs text-purple-600 hover:text-purple-800 transition-colors">
                稍后提醒
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}