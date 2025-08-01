import DashboardLayout from '@/components/dashboard/DashboardLayout'
import Link from 'next/link'

// 获取统计数据
async function getStats() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/dashboard/stats`, {
      next: { revalidate: 30 } // 30秒缓存
    })
    
    if (!response.ok) {
      console.error('获取统计数据失败:', response.status)
      return null
    }
    
    return response.json()
  } catch (error) {
    console.error('获取统计数据出错:', error)
    return null
  }
}

export default async function DashboardPage() {
  const stats = await getStats()
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* 欢迎区域 */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">控制台</h1>
          <p className="text-gray-600">LLM Gateway 管理后台</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard title="总请求数" value={stats ? stats.totalRequests.toLocaleString() : "---"} />
          <StatsCard title="活跃账号" value={stats ? `${stats.activeAccounts}/10` : "---"} />
          <StatsCard title="API 密钥" value={stats ? stats.apiKeysCount.toString() : "---"} />
          <StatsCard title="成功率" value={stats ? `${stats.successRate}%` : "---"} />
        </div>

        {/* 功能区域 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 快速操作 */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">快速操作</h2>
            <div className="space-y-4">
              <ActionButton 
                title="添加上游账号"
                description="连接 Claude 或 Gemini 账号"
                href="/dashboard/accounts"
              />
              <ActionButton 
                title="创建 API 密钥"
                description="生成新的访问密钥"
                href="/dashboard/api-keys"
              />
              <ActionButton 
                title="查看统计报告"
                description="使用情况和成本分析"
                href="/dashboard/stats"
              />
            </div>
          </div>

          {/* 系统状态 */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">系统状态</h2>
            <div className="space-y-4">
              <StatusItem label="数据库服务" status="正常" />
              <StatusItem label="缓存服务" status="正常" />
              <StatusItem label="上游账号" status="8/10 正常" />
              <StatusItem label="API 响应" status="245ms" />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

// 统计卡片组件
function StatsCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white border rounded-lg p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

// 操作按钮组件
function ActionButton({ title, description, href }: { 
  title: string
  description: string
  href: string
}) {
  return (
    <Link 
      href={href}
      className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1">
        <h3 className="font-medium text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <div className="ml-4">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

// 状态项组件
function StatusItem({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-gray-700">{label}</span>
      <span className="text-sm text-gray-600">{status}</span>
    </div>
  )
}