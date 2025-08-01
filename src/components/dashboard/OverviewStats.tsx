interface OverviewStatsProps {
  stats: {
    totalRequests: number
    activeAccounts: number
    apiKeysCount: number
    successRate: number
    avgResponseTime: number
    totalCost: number
  }
}

export default function OverviewStats({ stats }: OverviewStatsProps) {
  const statItems = [
    {
      name: '总请求数',
      value: stats.totalRequests.toLocaleString(),
      change: '+12%',
      changeType: 'positive' as const,
      icon: ChartBarIcon,
      color: 'blue'
    },
    {
      name: '活跃账号',
      value: `${stats.activeAccounts}/${stats.activeAccounts + 2}`,
      change: '100%',
      changeType: 'positive' as const,  
      icon: ServerIcon,
      color: 'green'
    },
    {
      name: 'API 密钥',
      value: stats.apiKeysCount.toString(),
      change: '+3',
      changeType: 'positive' as const,
      icon: KeyIcon,
      color: 'purple'
    },
    {
      name: '成功率',
      value: `${stats.successRate}%`,
      change: '+0.5%',
      changeType: 'positive' as const,
      icon: CheckCircleIcon,
      color: 'emerald'
    },
    {
      name: '平均响应时间',
      value: `${stats.avgResponseTime}ms`,
      change: '-15ms',
      changeType: 'positive' as const,
      icon: ClockIcon,  
      color: 'orange'
    },
    {
      name: '总成本',
      value: `$${stats.totalCost.toFixed(2)}`,
      change: '+$12.5',
      changeType: 'neutral' as const,
      icon: CurrencyDollarIcon,
      color: 'red'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statItems.map((item) => {
        const Icon = item.icon
        const colorClasses = {
          blue: 'bg-blue-50 text-blue-600',
          green: 'bg-green-50 text-green-600', 
          purple: 'bg-purple-50 text-purple-600',
          emerald: 'bg-emerald-50 text-emerald-600',
          orange: 'bg-orange-50 text-orange-600',
          red: 'bg-red-50 text-red-600'
        }
        
        const changeClasses = {
          positive: 'text-green-600 bg-green-50',
          negative: 'text-red-600 bg-red-50', 
          neutral: 'text-gray-600 bg-gray-50'
        }

        return (
          <div key={item.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-600">{item.name}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
                <div className="flex items-center mt-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${changeClasses[item.changeType]}`}>
                    {item.change}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">较上周</span>
                </div>
              </div>
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClasses[item.color]}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 图标组件
function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v-2H7v-2H4a1 1 0 01-1-1v-4c0-2.946 2.033-5.433 4.787-6.138C9.13 1.248 10.513 1 12 1a9 9 0 019 9c0 .796-.15 1.556-.425 2.258L15 7z" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function CurrencyDollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}