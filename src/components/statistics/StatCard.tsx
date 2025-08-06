'use client'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  change?: number
  trend?: 'up' | 'down' | 'stable'
  icon?: string
  loading?: boolean
  onClick?: () => void
}

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  change, 
  trend, 
  icon, 
  loading = false,
  onClick 
}: StatCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
      </div>
    )
  }

  const isClickable = !!onClick
  const Component = isClickable ? 'button' : 'div'

  return (
    <Component
      onClick={onClick}
      className={`bg-white rounded-lg shadow p-6 transition-all duration-200 ${
        isClickable 
          ? 'hover:shadow-md hover:scale-105 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500' 
          : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">
          {title}
        </h3>
        {icon && (
          <span className="text-2xl" role="img" aria-label={title}>
            {icon}
          </span>
        )}
      </div>
      
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-3xl font-bold text-gray-900 mb-1">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        
        {change !== undefined && trend && (
          <div className="flex items-center ml-4">
            <TrendIndicator change={change} trend={trend} />
          </div>
        )}
      </div>
    </Component>
  )
}

interface TrendIndicatorProps {
  change: number
  trend: 'up' | 'down' | 'stable'
}

function TrendIndicator({ change, trend }: TrendIndicatorProps) {
  const absChange = Math.abs(change)
  
  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up':
        return 'text-green-600 bg-green-100'
      case 'down':
        return 'text-red-600 bg-red-100'
      case 'stable':
        return 'text-gray-600 bg-gray-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }
  
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17l9.2-9.2M17 17V7H7" />
          </svg>
        )
      case 'down':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7l-9.2 9.2M7 7v10h10" />
          </svg>
        )
      case 'stable':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        )
      default:
        return null
    }
  }
  
  return (
    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTrendColor(trend)}`}>
      {getTrendIcon(trend)}
      <span className="ml-1">
        {trend === 'stable' ? '持平' : `${absChange.toFixed(1)}%`}
      </span>
    </div>
  )
}

// 多指标卡片组件
interface MultiStatCardProps {
  title: string
  stats: {
    label: string
    value: string | number
    change?: number
    trend?: 'up' | 'down' | 'stable'
  }[]
  icon?: string
  loading?: boolean
}

export function MultiStatCard({ title, stats, icon, loading = false }: MultiStatCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-3 bg-gray-200 rounded w-1/3"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {icon && (
          <span className="text-2xl" role="img" aria-label={title}>
            {icon}
          </span>
        )}
      </div>
      
      <div className="space-y-3">
        {stats.map((stat, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{stat.label}</span>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-semibold text-gray-900">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </span>
              {stat.change !== undefined && stat.trend && (
                <TrendIndicator change={stat.change} trend={stat.trend} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 进度卡片组件
interface ProgressCardProps {
  title: string
  current: number
  target: number
  unit?: string
  description?: string
  color?: 'blue' | 'green' | 'yellow' | 'red'
  icon?: string
}

export function ProgressCard({ 
  title, 
  current, 
  target, 
  unit = '', 
  description, 
  color = 'blue',
  icon 
}: ProgressCardProps) {
  const percentage = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const isOverTarget = current > target
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500'
  }
  
  const bgColorClasses = {
    blue: 'bg-blue-100',
    green: 'bg-green-100',
    yellow: 'bg-yellow-100',
    red: 'bg-red-100'
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {icon && (
          <span className="text-2xl" role="img" aria-label={title}>
            {icon}
          </span>
        )}
      </div>
      
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-2xl font-bold text-gray-900">
            {current.toLocaleString()}{unit}
          </span>
          <span className="text-sm text-gray-500">
            / {target.toLocaleString()}{unit}
          </span>
        </div>
        
        <div className={`w-full ${bgColorClasses[color]} rounded-full h-2`}>
          <div
            className={`${colorClasses[isOverTarget ? 'red' : color]} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          ></div>
        </div>
        
        <div className="flex items-center justify-between mt-2">
          <span className={`text-sm font-medium ${
            isOverTarget ? 'text-red-600' : 'text-gray-600'
          }`}>
            {percentage.toFixed(1)}%
          </span>
          {isOverTarget && (
            <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">
              超出目标
            </span>
          )}
        </div>
      </div>
      
      {description && (
        <p className="text-sm text-gray-600">{description}</p>
      )}
    </div>
  )
}