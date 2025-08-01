import Link from 'next/link'

interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string[]
  lastUsed: string
  requestCount: number
  status: 'active' | 'inactive' | 'expired'
  expiresAt?: string
}

interface ApiKeysCardProps {
  apiKeys: ApiKey[]
}

export default function ApiKeysCard({ apiKeys }: ApiKeysCardProps) {
  const getStatusColor = (status: ApiKey['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      case 'expired':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: ApiKey['status']) => {
    switch (status) {
      case 'active':
        return '正常'
      case 'inactive':
        return '停用'
      case 'expired':
        return '已过期'
      default:
        return '未知'
    }
  }

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return key
    return `${key.slice(0, 8)}...${key.slice(-4)}`
  }

  const getPermissionColor = (permission: string) => {
    switch (permission.toLowerCase()) {
      case 'read':
        return 'bg-blue-100 text-blue-800'
      case 'write':
        return 'bg-yellow-100 text-yellow-800'
      case 'admin':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">API 密钥</h3>
          <Link 
            href="/dashboard/api-keys"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            查看全部
          </Link>
        </div>
      </div>
      
      <div className="p-6">
        {apiKeys.length === 0 ? (
          <div className="text-center py-8">
            <KeyIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">暂无 API 密钥</p>
            <Link 
              href="/dashboard/api-keys"
              className="inline-flex items-center mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            >
              创建密钥
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.slice(0, 4).map((apiKey) => (
              <div key={apiKey.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h4 className="text-sm font-medium text-gray-900">{apiKey.name}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(apiKey.status)}`}>
                        {getStatusText(apiKey.status)}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2 mb-2">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                        {maskApiKey(apiKey.key)}
                      </code>
                      <button className="text-xs text-blue-600 hover:text-blue-700">
                        复制
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      {apiKey.permissions.map((permission) => (
                        <span
                          key={permission}
                          className={`px-2 py-1 text-xs font-medium rounded ${getPermissionColor(permission)}`}
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>请求数: {apiKey.requestCount}</span>
                      <span>最后使用: {apiKey.lastUsed}</span>
                      {apiKey.expiresAt && (
                        <span>过期时间: {apiKey.expiresAt}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <button className="p-1 text-gray-400 hover:text-gray-600">
                      <EditIcon className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-red-600">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {apiKeys.length > 4 && (
              <div className="text-center pt-4">
                <Link 
                  href="/dashboard/api-keys"
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  查看更多 ({apiKeys.length - 4} 个)
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v-2H7v-2H4a1 1 0 01-1-1v-4c0-2.946 2.033-5.433 4.787-6.138C9.13 1.248 10.513 1 12 1a9 9 0 019 9c0 .796-.15 1.556-.425 2.258L15 7z" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}