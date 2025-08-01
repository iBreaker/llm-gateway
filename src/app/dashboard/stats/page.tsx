import DashboardLayout from '@/components/dashboard/DashboardLayout'

// 模拟数据
const mockStats = {
  totalRequests: 12543,
  totalCost: 287.56,
  avgResponseTime: 245,
  successRate: 99.2
}

const mockDailyStats = [
  { date: '01-01', requests: 1200, cost: 15.6, successRate: 99.1 },
  { date: '01-02', requests: 1450, cost: 18.9, successRate: 99.3 },
  { date: '01-03', requests: 1100, cost: 14.3, successRate: 98.8 },
  { date: '01-04', requests: 1800, cost: 23.4, successRate: 99.5 },
  { date: '01-05', requests: 1650, cost: 21.5, successRate: 99.2 },
  { date: '01-06', requests: 1300, cost: 16.9, successRate: 99.0 },
  { date: '01-07', requests: 1550, cost: 20.2, successRate: 99.4 }
]

const mockTopApiKeys = [
  { name: '生产环境密钥', requests: 8542, cost: 187.23 },
  { name: '测试环境密钥', requests: 2341, cost: 56.78 },
  { name: '开发环境密钥', requests: 1660, cost: 43.55 }
]

const mockTopAccounts = [
  { email: 'claude1@example.com', requests: 6234, successRate: 99.8 },
  { email: 'gemini1@example.com', requests: 4567, successRate: 98.5 },
  { email: 'claude2@example.com', requests: 1742, successRate: 99.1 }
]

export default function StatsPage() {
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
          <StatCard title="总请求数" value={mockStats.totalRequests.toLocaleString()} />
          <StatCard title="总成本" value={`$${mockStats.totalCost.toFixed(2)}`} />
          <StatCard title="平均响应时间" value={`${mockStats.avgResponseTime}ms`} />
          <StatCard title="成功率" value={`${mockStats.successRate}%`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 每日趋势图 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">7天请求趋势</h2>
            <div className="space-y-4">
              {mockDailyStats.map((stat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{stat.date}</span>
                  <div className="flex items-center space-x-4">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${(stat.requests / 2000) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-16 text-right">
                      {stat.requests}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 成本趋势 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">7天成本趋势</h2>
            <div className="space-y-4">
              {mockDailyStats.map((stat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{stat.date}</span>
                  <div className="flex items-center space-x-4">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${(stat.cost / 25) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-16 text-right">
                      ${stat.cost.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top API Keys */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top API 密钥</h2>
            <div className="space-y-4">
              {mockTopApiKeys.map((apiKey, index) => (
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
              ))}
            </div>
          </div>

          {/* Top 账号 */}
          <div className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 上游账号</h2>
            <div className="space-y-4">
              {mockTopAccounts.map((account, index) => (
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
              ))}
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
                {mockDailyStats.map((stat, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 text-sm text-gray-900">2024-{stat.date}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{stat.requests.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">${stat.cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{stat.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white border rounded-lg p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}