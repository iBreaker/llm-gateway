import DashboardLayout from '@/components/dashboard/DashboardLayout'
import Link from 'next/link'

// 模拟数据
const mockAccounts = [
  {
    id: '1',
    type: 'claude',
    email: 'claude1@example.com',
    status: 'active',
    lastUsed: '2小时前',
    requestCount: 2456,
    successRate: 99.8,
    createdAt: '2024-01-15'
  },
  {
    id: '2',
    type: 'gemini',
    email: 'gemini1@example.com',
    status: 'active',
    lastUsed: '1小时前',
    requestCount: 1823,
    successRate: 98.5,
    createdAt: '2024-01-12'
  },
  {
    id: '3',
    type: 'claude',
    email: 'claude2@example.com',
    status: 'inactive',
    lastUsed: '1天前',
    requestCount: 945,
    successRate: 99.1,
    createdAt: '2024-01-10'
  },
  {
    id: '4',
    type: 'gemini',
    email: 'gemini2@example.com',
    status: 'error',
    lastUsed: '3天前',
    requestCount: 234,
    successRate: 87.2,
    createdAt: '2024-01-08'
  }
]

export default function AccountsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题和操作 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">上游账号管理</h1>
            <p className="text-gray-600 mt-2">管理 Claude 和 Gemini 账号池</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            添加账号
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard title="总账号数" value="4" />
          <StatCard title="活跃账号" value="2" />
          <StatCard title="异常账号" value="1" />
          <StatCard title="平均成功率" value="96.2%" />
        </div>

        {/* 账号列表 */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">账号列表</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">账号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">请求数</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功率</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后使用</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {mockAccounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{account.email}</div>
                      <div className="text-sm text-gray-500">创建于 {account.createdAt}</div>
                    </td>
                    <td className="px-6 py-4">
                      <TypeBadge type={account.type} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {account.requestCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {account.successRate}%
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {account.lastUsed}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        <button className="text-blue-600 hover:text-blue-700 text-sm">编辑</button>
                        <button className="text-red-600 hover:text-red-700 text-sm">删除</button>
                      </div>
                    </td>
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
    <div className="bg-white border rounded-lg p-4">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors = {
    claude: 'bg-blue-100 text-blue-800',
    gemini: 'bg-green-100 text-green-800'
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[type as keyof typeof colors]}`}>
      {type === 'claude' ? 'Claude' : 'Gemini'}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  }
  
  const labels = {
    active: '正常',
    inactive: '闲置',
    error: '异常'
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  )
}