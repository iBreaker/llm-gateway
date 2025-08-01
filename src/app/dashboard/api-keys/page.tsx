'use client'

import DashboardLayout from '@/components/dashboard/DashboardLayout'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import AddApiKeyModal from '@/components/dashboard/AddApiKeyModal'
import { useState, useEffect } from 'react'

interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string[]
  lastUsed: string
  requestCount: number
  status: string
  expiresAt: string | null
  createdAt: string
}

interface ApiKeyStats {
  totalKeys: number
  activeKeys: number
  totalRequests: number
  todayRequests: number
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [stats, setStats] = useState<ApiKeyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingApiKey, setEditingApiKey] = useState<ApiKey | null>(null)

  useEffect(() => {
    async function fetchApiKeys() {
      try {
        const response = await fetch('/api/dashboard/api-keys')
        if (!response.ok) {
          throw new Error('获取API密钥数据失败')
        }
        const data = await response.json()
        setApiKeys(data.apiKeys)
        setStats(data.stats)
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知错误')
      } finally {
        setLoading(false)
      }
    }

    fetchApiKeys()
  }, [])

  const handleDeleteApiKey = async (apiKeyId: string) => {
    if (!confirm('确定要删除此API密钥吗？')) return
    
    try {
      const response = await fetch(`/api/dashboard/api-keys/${apiKeyId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error('删除API密钥失败')
      }
      
      // 重新获取数据
      const updatedResponse = await fetch('/api/dashboard/api-keys')
      const data = await updatedResponse.json()
      setApiKeys(data.apiKeys)
      setStats(data.stats)
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const refreshData = async () => {
    const response = await fetch('/api/dashboard/api-keys')
    const data = await response.json()
    setApiKeys(data.apiKeys)
    setStats(data.stats)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">加载中...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">错误：{error}</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题和操作 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API 密钥管理</h1>
            <p className="text-gray-600 mt-2">管理和监控 API 访问密钥</p>
          </div>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            创建密钥
          </Button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard 
            title="总密钥数" 
            value={stats?.totalKeys?.toString() || '0'}
            color="blue"
          />
          <StatCard 
            title="活跃密钥" 
            value={stats?.activeKeys?.toString() || '0'}
            color="green"
          />
          <StatCard 
            title="总请求数" 
            value={stats?.totalRequests?.toLocaleString() || '0'}
            color="purple"
          />
          <StatCard 
            title="今日请求" 
            value={stats?.todayRequests?.toString() || '0'}
            color="orange"
          />
        </div>

        {/* 密钥列表 */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">密钥列表</h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {apiKeys.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                暂无API密钥数据
              </div>
            ) : (
              apiKeys.map((apiKey) => (
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
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setEditingApiKey(apiKey)}
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        }
                      />
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteApiKey(apiKey.id)}
                        className="text-red-600 hover:text-red-700"
                        icon={
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        }
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 创建API密钥模态框 */}
        <AddApiKeyModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={refreshData}
        />
      </div>
    </DashboardLayout>
  )
}

// StatCard moved to shared component

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