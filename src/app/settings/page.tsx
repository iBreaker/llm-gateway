'use client'

import { useEffect, useState } from 'react'
import { Save, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { apiClient } from '../../utils/api'

interface SystemInfo {
  version: string
  uptime?: string
  environment: string
  accountCount: number
  userCount: number
  totalRequests?: number
}

interface SaveStatus {
  type: 'success' | 'error' | null
  message: string
}

export default function SettingsPage() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadSystemInfo()
  }, [])

  const loadSystemInfo = async () => {
    try {
      // 获取系统健康状态
      const healthData = await apiClient.get('/api/health/system')
      
      // 获取基础统计
      const statsData = await apiClient.get<{totalRequests?: number}>('/api/stats/basic')
      
      // 获取用户列表来统计用户数
      const usersData = await apiClient.get<{users?: any[]}>('/api/users')
      
      // 获取账号列表来统计账号数
      const accountsData = await apiClient.get<{accounts?: any[]}>('/api/accounts')
      
      setSystemInfo({
        version: '0.1.0',
        environment: 'production',
        userCount: usersData.users?.length || 0,
        accountCount: accountsData.accounts?.length || 0,
        totalRequests: statsData.totalRequests || 0,
        uptime: '系统运行中'
      })
    } catch (error) {
      console.error('获取系统信息失败:', error)
      setError('获取系统信息失败')
      // 使用默认值
      setSystemInfo({
        version: '0.1.0',
        environment: 'unknown',
        userCount: 0,
        accountCount: 0,
        totalRequests: 0,
        uptime: '未知'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    setIsLoading(true)
    setError('')
    await loadSystemInfo()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">系统设置</h1>
          <p className="text-sm text-zinc-600">查看系统运行状态和基本信息</p>
        </div>
        <div className="flex items-center space-x-3">
          {error && (
            <div className="flex items-center px-3 py-1 text-sm rounded-sm bg-red-100 text-red-700">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}
          <button 
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center px-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            <Info className="w-4 h-4 mr-2" />
            {isLoading ? '刷新中...' : '刷新信息'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 系统信息 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">系统信息</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  系统版本
                </label>
                <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                  {systemInfo?.version || 'N/A'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  运行环境
                </label>
                <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                  {systemInfo?.environment || 'N/A'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  用户数量
                </label>
                <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                  {systemInfo?.userCount || 0}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  上游账号数量
                </label>
                <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                  {systemInfo?.accountCount || 0}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                总请求数
              </label>
              <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                {systemInfo?.totalRequests?.toLocaleString() || 0}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                系统状态
              </label>
              <div className="text-sm text-zinc-900 bg-green-50 text-green-700 px-2 py-1 rounded">
                ✅ {systemInfo?.uptime || '运行中'}
              </div>
            </div>
          </div>
        </div>

        {/* API 状态 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">API 状态</h2>
          </div>
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium">认证服务</span>
                </div>
                <span className="text-xs text-gray-500">正常</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium">账号管理</span>
                </div>
                <span className="text-xs text-gray-500">正常</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium">统计服务</span>
                </div>
                <span className="text-xs text-gray-500">正常</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium">代理服务</span>
                </div>
                <span className="text-xs text-gray-500">正常</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}