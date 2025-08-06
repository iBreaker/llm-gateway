'use client'

interface AccountPerformanceTableProps {
  accounts: {
    id: string
    name: string
    type: string
    requests: number
    healthScore: number
    avgResponseTime: number
    successRate: number
    lastUsed: string
  }[]
}

export function AccountPerformanceTable({ accounts }: AccountPerformanceTableProps) {
  if (!accounts || accounts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">账号性能详情</h3>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-gray-500">暂无账号数据</p>
        </div>
      </div>
    )
  }

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100'
    if (score >= 80) return 'text-yellow-600 bg-yellow-100'
    if (score >= 70) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 99) return 'text-green-600'
    if (rate >= 95) return 'text-yellow-600'
    return 'text-red-600'
  }

  const formatLastUsed = (lastUsed: string) => {
    const date = new Date(lastUsed)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">账号性能详情</h3>
        <p className="text-sm text-gray-600 mt-1">上游账号的性能指标和健康状态</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                账号信息
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                健康分数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                请求数
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                成功率
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                响应时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                最后使用
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map((account, index) => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <div className="text-sm font-medium text-gray-900">{account.name}</div>
                    <div className="text-sm text-gray-500">{account.type}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHealthScoreColor(account.healthScore)}`}>
                      {account.healthScore.toFixed(1)}
                    </span>
                    <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full ${
                          account.healthScore >= 90 ? 'bg-green-500' :
                          account.healthScore >= 80 ? 'bg-yellow-500' :
                          account.healthScore >= 70 ? 'bg-orange-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${account.healthScore}%` }}
                      ></div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{account.requests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">
                    {((account.requests / accounts.reduce((sum, acc) => sum + acc.requests, 0)) * 100).toFixed(1)}% 占比
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`text-sm font-medium ${getSuccessRateColor(account.successRate)}`}>
                    {account.successRate.toFixed(1)}%
                  </div>
                  <div className="flex items-center mt-1">
                    <div className={`w-2 h-2 rounded-full mr-1 ${
                      account.successRate >= 99 ? 'bg-green-400' :
                      account.successRate >= 95 ? 'bg-yellow-400' : 'bg-red-400'
                    }`}></div>
                    <span className="text-xs text-gray-500">
                      {account.successRate >= 99 ? '优秀' :
                       account.successRate >= 95 ? '良好' : '需改善'}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{account.avgResponseTime}ms</div>
                  <div className="text-xs text-gray-500">
                    {account.avgResponseTime < 1000 ? '快速' :
                     account.avgResponseTime < 3000 ? '正常' : '较慢'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{formatLastUsed(account.lastUsed)}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(account.lastUsed).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 底部统计摘要 */}
      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {accounts.length}
            </div>
            <div className="text-xs text-gray-500">总账号数</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-green-600">
              {accounts.filter(acc => acc.healthScore >= 80).length}
            </div>
            <div className="text-xs text-gray-500">健康账号</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-blue-600">
              {(accounts.reduce((sum, acc) => sum + acc.healthScore, 0) / accounts.length).toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">平均健康分数</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-purple-600">
              {Math.round(accounts.reduce((sum, acc) => sum + acc.avgResponseTime, 0) / accounts.length)}ms
            </div>
            <div className="text-xs text-gray-500">平均响应时间</div>
          </div>
        </div>
      </div>
    </div>
  )
}