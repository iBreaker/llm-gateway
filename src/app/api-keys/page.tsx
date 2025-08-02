'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'

interface ApiKey {
  id: string
  name: string
  key: string
  permissions: string[]
  usage: {
    requests: number
    lastUsed?: string
  }
  expiresAt?: string
  createdAt: string
  status: 'active' | 'inactive'
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  useEffect(() => {
    fetchApiKeys()
  }, [])

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/dashboard/api-keys')
      if (response.ok) {
        const data = await response.json()
        setApiKeys(data)
      }
    } catch (error) {
      console.error('获取API密钥列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApiKeyCreated = () => {
    fetchApiKeys()
    setIsCreateModalOpen(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API 密钥</h1>
            <p className="mt-2 text-gray-600">管理您的 API 密钥和权限</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
            创建密钥
          </button>
        </div>

        {apiKeys.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-gray-500 mb-4">暂无 API 密钥</div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
              创建第一个密钥
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {apiKeys.map((apiKey) => (
              <div key={apiKey.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{apiKey.name}</h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    apiKey.status === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {apiKey.status}
                  </span>
                </div>
                <p className="text-gray-600 text-sm font-mono">{apiKey.key.substring(0, 20)}...</p>
                <p className="text-gray-500 text-xs mt-2">权限: {apiKey.permissions.join(', ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}