import DashboardLayout from '@/components/dashboard/DashboardLayout'

// 模拟数据
const mockApiKeys = [
  {
    id: '1',
    name: '生产环境密钥',
    key: 'llmgw_sk_1234567890abcdef1234567890abcdef',
    permissions: ['read', 'write'],
    lastUsed: '30分钟前',
    requestCount: 1245,
    status: 'active',
    expiresAt: '2024-12-31',
    createdAt: '2024-01-15'
  },
  {
    id: '2',
    name: '测试环境密钥',
    key: 'llmgw_sk_fedcba0987654321fedcba0987654321',
    permissions: ['read'],
    lastUsed: '2小时前',
    requestCount: 568,
    status: 'active',
    expiresAt: null,
    createdAt: '2024-01-12'
  },
  {
    id: '3',
    name: '开发环境密钥',
    key: 'llmgw_sk_abcdef1234567890abcdef1234567890',
    permissions: ['read', 'write', 'admin'],
    lastUsed: '1天前',
    requestCount: 89,
    status: 'inactive',
    expiresAt: '2024-06-30',
    createdAt: '2024-01-10'
  }
]

export default function ApiKeysPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题和操作 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API 密钥管理</h1>
            <p className="text-gray-600 mt-2">管理和监控 API 访问密钥</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            创建密钥
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard title="总密钥数" value="3" />
          <StatCard title="活跃密钥" value="2" />
          <StatCard title="总请求数" value="1,902" />
          <StatCard title="今日请求" value="245" />
        </div>

        {/* 密钥列表 */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">密钥列表</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {mockApiKeys.map((apiKey) => (
              <div key={apiKey.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900">{apiKey.name}</h3>
                      <StatusBadge status={apiKey.status} />
                    </div>
                    
                    <div className="flex items-center space-x-2 mb-3">
                      <code className="text-sm bg-gray-100 px-3 py-1 rounded font-mono">
                        {maskApiKey(apiKey.key)}
                      </code>
                      <button className="text-sm text-blue-600 hover:text-blue-700">
                        复制
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {apiKey.permissions.map((permission) => (
                        <PermissionBadge key={permission} permission={permission} />
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
                      <div>
                        <span className="font-medium">请求数:</span> {apiKey.requestCount.toLocaleString()}
                      </div>
                      <div>
                        <span className="font-medium">最后使用:</span> {apiKey.lastUsed}
                      </div>
                      <div>
                        <span className="font-medium">创建时间:</span> {apiKey.createdAt}
                      </div>
                      <div>
                        <span className="font-medium">过期时间:</span>{' '}
                        {apiKey.expiresAt || '永不过期'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button className="text-gray-400 hover:text-gray-600 p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button className="text-gray-400 hover:text-red-600 p-1">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
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

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800'
  }
  
  const labels = {
    active: '活跃',
    inactive: '停用'
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  )
}

function PermissionBadge({ permission }: { permission: string }) {
  const colors = {
    read: 'bg-blue-100 text-blue-800',
    write: 'bg-yellow-100 text-yellow-800',
    admin: 'bg-red-100 text-red-800'
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${colors[permission as keyof typeof colors]}`}>
      {permission}
    </span>
  )
}

function maskApiKey(key: string) {
  if (key.length <= 12) return key
  return `${key.slice(0, 12)}...${key.slice(-8)}`
}