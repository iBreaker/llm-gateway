'use client'

import { useState } from 'react'
import { FilterOptions } from './StatisticsDashboard'

interface FilterPanelProps {
  filters: FilterOptions
  onChange: (filters: FilterOptions) => void
  availableModels: string[]
  availableAccounts: { id: string; name: string }[]
}

export function FilterPanel({ filters, onChange, availableModels, availableAccounts }: FilterPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleModelToggle = (model: string) => {
    const newModels = filters.models.includes(model)
      ? filters.models.filter(m => m !== model)
      : [...filters.models, model]
    
    onChange({
      ...filters,
      models: newModels
    })
  }

  const handleAccountToggle = (accountId: string) => {
    const newAccounts = filters.accounts.includes(accountId)
      ? filters.accounts.filter(a => a !== accountId)
      : [...filters.accounts, accountId]
    
    onChange({
      ...filters,
      accounts: newAccounts
    })
  }

  const handleStatusToggle = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status]
    
    onChange({
      ...filters,
      status: newStatus
    })
  }

  const clearAllFilters = () => {
    onChange({
      ...filters,
      models: [],
      accounts: [],
      status: []
    })
  }

  const hasActiveFilters = filters.models.length > 0 || filters.accounts.length > 0 || filters.status.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700">筛选条件:</span>
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {filters.models.length + filters.accounts.length + filters.status.length} 个活跃筛选
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              清除所有
            </button>
          )}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
          >
            {showAdvanced ? '收起' : '展开'} 高级筛选
            <svg 
              className={`w-4 h-4 ml-1 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* 快速状态筛选 */}
      <div className="flex flex-wrap gap-2">
        {['success', 'error', 'timeout'].map((status) => (
          <button
            key={status}
            onClick={() => handleStatusToggle(status)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filters.status.includes(status)
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status === 'success' && '✅ 成功'}
            {status === 'error' && '❌ 错误'}
            {status === 'timeout' && '⏱️ 超时'}
          </button>
        ))}
      </div>

      {/* 高级筛选选项 */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
          {/* 模型筛选 */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">模型类型</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {availableModels.length === 0 ? (
                <p className="text-sm text-gray-500">暂无可用模型</p>
              ) : (
                availableModels.map((model) => (
                  <label key={model} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.models.includes(model)}
                      onChange={() => handleModelToggle(model)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{model}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* 账号筛选 */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">上游账号</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {availableAccounts.length === 0 ? (
                <p className="text-sm text-gray-500">暂无可用账号</p>
              ) : (
                availableAccounts.map((account) => (
                  <label key={account.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.accounts.includes(account.id)}
                      onChange={() => handleAccountToggle(account.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">{account.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 活跃筛选器显示 */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {filters.models.map((model) => (
            <span
              key={`model-${model}`}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              模型: {model}
              <button
                onClick={() => handleModelToggle(model)}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                ×
              </button>
            </span>
          ))}
          {filters.accounts.map((accountId) => {
            const account = availableAccounts.find(a => a.id === accountId)
            return (
              <span
                key={`account-${accountId}`}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
              >
                账号: {account?.name || accountId}
                <button
                  onClick={() => handleAccountToggle(accountId)}
                  className="ml-1 text-green-600 hover:text-green-800"
                >
                  ×
                </button>
              </span>
            )
          })}
          {filters.status.map((status) => (
            <span
              key={`status-${status}`}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
            >
              状态: {status}
              <button
                onClick={() => handleStatusToggle(status)}
                className="ml-1 text-gray-600 hover:text-gray-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}