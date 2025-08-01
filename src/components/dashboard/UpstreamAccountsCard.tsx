import Link from 'next/link'

interface UpstreamAccount {
  id: string
  type: 'claude' | 'gemini'
  email: string
  status: 'active' | 'inactive' | 'error'
  lastUsed: string
  requestCount: number
  successRate: number
}

interface UpstreamAccountsCardProps {
  accounts: UpstreamAccount[]
}

export default function UpstreamAccountsCard({ accounts }: UpstreamAccountsCardProps) {
  const getStatusColor = (status: UpstreamAccount['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: UpstreamAccount['status']) => {
    switch (status) {
      case 'active':
        return '正常'
      case 'inactive':
        return '闲置'
      case 'error':
        return '异常'
      default:
        return '未知'
    }
  }

  const getTypeIcon = (type: UpstreamAccount['type']) => {
    if (type === 'claude') {
      return (
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-xs font-semibold text-blue-600">C</span>
        </div>
      )
    } else {
      return (
        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
          <span className="text-xs font-semibold text-green-600">G</span>
        </div>
      )
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">上游账号</h3>
          <Link 
            href="/dashboard/accounts"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            查看全部
          </Link>
        </div>
      </div>
      
      <div className="p-6">
        {accounts.length === 0 ? (
          <div className="text-center py-8">
            <ServerIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">暂无上游账号</p>
            <Link 
              href="/dashboard/accounts"
              className="inline-flex items-center mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            >
              添加账号
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.slice(0, 5).map((account) => (
              <div key={account.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getTypeIcon(account.type)}
                  <div>
                    <p className="text-sm font-medium text-gray-900">{account.email}</p>
                    <p className="text-xs text-gray-500">
                      最后使用: {account.lastUsed}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">请求数</p>
                    <p className="text-sm font-medium text-gray-900">{account.requestCount}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">成功率</p>
                    <p className="text-sm font-medium text-gray-900">{account.successRate}%</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(account.status)}`}>
                    {getStatusText(account.status)}
                  </span>
                </div>
              </div>
            ))}
            
            {accounts.length > 5 && (
              <div className="text-center pt-4">
                <Link 
                  href="/dashboard/accounts"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  查看更多 ({accounts.length - 5} 个)
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  )
}