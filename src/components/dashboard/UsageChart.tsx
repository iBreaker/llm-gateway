'use client'

import { useState } from 'react'

interface UsageData {
  date: string
  requests: number
  cost: number
  successRate: number
}

interface UsageChartProps {
  data: UsageData[]
}

export default function UsageChart({ data }: UsageChartProps) {
  const [activeTab, setActiveTab] = useState<'requests' | 'cost' | 'success'>('requests')
  
  // 计算图表数据
  const maxValue = Math.max(...data.map(d => {
    switch (activeTab) {
      case 'requests': return d.requests
      case 'cost': return d.cost
      case 'success': return d.successRate
      default: return 0
    }
  }))

  const getBarHeight = (value: number) => {
    return Math.max((value / maxValue) * 100, 2) // 最小高度2%
  }

  const getValueDisplay = (item: UsageData) => {
    switch (activeTab) {
      case 'requests': return item.requests.toLocaleString()
      case 'cost': return `$${item.cost.toFixed(2)}`
      case 'success': return `${item.successRate}%`
      default: return '0'
    }
  }

  const getTabColor = (tab: string) => {
    switch (tab) {
      case 'requests': return 'bg-blue-500'
      case 'cost': return 'bg-green-500'
      case 'success': return 'bg-purple-500'
      default: return 'bg-gray-500'
    }
  }

  const tabs = [
    { key: 'requests' as const, label: '请求数', icon: ChartBarIcon },
    { key: 'cost' as const, label: '成本', icon: CurrencyDollarIcon },
    { key: 'success' as const, label: '成功率', icon: CheckCircleIcon }
  ]

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">使用趋势</h3>
          <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="p-6">
        {data.length === 0 ? (
          <div className="text-center py-12">
            <ChartBarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">暂无使用数据</p>
          </div>
        ) : (
          <>
            {/* 图表区域 */}
            <div className="mb-6">
              <div className="flex items-end justify-between h-48 space-x-2">
                {data.map((item, index) => {
                  const value = (() => {
                    switch (activeTab) {
                      case 'requests': return item.requests
                      case 'cost': return item.cost
                      case 'success': return item.successRate
                      default: return 0
                    }
                  })()
                  
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center group">
                      <div className="relative w-full mb-2">
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 group-hover:opacity-80 ${getTabColor(activeTab)}`}
                          style={{ height: `${getBarHeight(value)}%` }}
                        />
                        {/* 悬浮显示数值 */}
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {getValueDisplay(item)}
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 text-center">
                        {new Date(item.date).toLocaleDateString('zh-CN', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 统计摘要 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {data.reduce((sum, item) => sum + item.requests, 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">总请求数</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  ${data.reduce((sum, item) => sum + item.cost, 0).toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">总成本</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {(data.reduce((sum, item) => sum + item.successRate, 0) / data.length).toFixed(1)}%
                </p>
                <p className="text-sm text-gray-500">平均成功率</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}