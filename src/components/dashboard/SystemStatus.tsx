interface SystemMetric {
  name: string
  status: 'healthy' | 'warning' | 'error'
  value: string
  description: string
  lastChecked: string
}

interface SystemStatusProps {
  metrics: SystemMetric[]
}

export default function SystemStatus({ metrics }: SystemStatusProps) {
  const getStatusColor = (status: SystemMetric['status']) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: SystemMetric['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />
      case 'warning':
        return <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-500" />
      default:
        return <ClockIcon className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusText = (status: SystemMetric['status']) => {
    switch (status) {
      case 'healthy':
        return '正常'
      case 'warning':
        return '警告'
      case 'error':
        return '异常'
      default:
        return '未知'
    }
  }

  const getOverallStatus = () => {
    const hasError = metrics.some(m => m.status === 'error')
    const hasWarning = metrics.some(m => m.status === 'warning')
    
    if (hasError) return 'error'
    if (hasWarning) return 'warning'
    return 'healthy'
  }

  const overallStatus = getOverallStatus()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">系统状态</h3>
          <div className="flex items-center space-x-2">
            {getStatusIcon(overallStatus)}
            <span className={`text-sm font-medium px-2 py-1 rounded-full ${getStatusColor(overallStatus)}`}>
              系统{getStatusText(overallStatus)}
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {metrics.length === 0 ? (
          <div className="text-center py-8">
            <ServerIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">暂无系统监控数据</p>
          </div>
        ) : (
          <div className="space-y-4">
            {metrics.map((metric, index) => (
              <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(metric.status)}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{metric.name}</h4>
                    <p className="text-xs text-gray-500">{metric.description}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{metric.value}</p>
                  <p className="text-xs text-gray-500">
                    更新于 {new Date(metric.lastChecked).toLocaleTimeString('zh-CN')}
                  </p>
                </div>
              </div>
            ))}
            
            {/* 系统信息摘要 */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-semibold text-green-600">
                    {metrics.filter(m => m.status === 'healthy').length}
                  </p>
                  <p className="text-xs text-gray-500">正常服务</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-yellow-600">
                    {metrics.filter(m => m.status === 'warning').length}
                  </p>
                  <p className="text-xs text-gray-500">警告项目</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-red-600">
                    {metrics.filter(m => m.status === 'error').length}
                  </p>
                  <p className="text-xs text-gray-500">异常项目</p>
                </div>
              </div>
            </div>

            {/* 快速操作 */}
            <div className="flex justify-center space-x-4 pt-4 border-t border-gray-200">
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
                <RefreshIcon className="w-4 h-4" />
                <span>刷新状态</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50">
                <ChartBarIcon className="w-4 h-4" />
                <span>查看详情</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// 图标组件
function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ExclamationTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  )
}

function XCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}