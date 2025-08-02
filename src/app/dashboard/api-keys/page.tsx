'use client'

import { useEffect, useState } from 'react'
import { Plus, MoreHorizontal, Copy } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  keyPreview: string
  permissions: string
  lastUsed: string | null
  isActive: boolean
  createdAt: string
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchApiKeys = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch('/api/dashboard/api-keys', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setApiKeys(data.apiKeys || [])
        }
      } catch (error) {
        console.error('获取 API Keys 失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchApiKeys()
  }, [])

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('复制失败:', err)
    }
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
          <h1 className="text-xl font-bold text-zinc-900">API Keys</h1>
          <p className="text-sm text-zinc-600">管理访问密钥和权限</p>
        </div>
        <button className="flex items-center px-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 transition-colors">
          <Plus className="w-4 h-4 mr-2" />
          创建 API Key
        </button>
      </div>

      {/* API Keys 列表 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        {apiKeys.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-600">暂无 API Keys</p>
            <button className="mt-3 text-sm text-zinc-500 hover:text-zinc-700">
              创建第一个 API Key
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {apiKeys.map((apiKey) => (
              <div key={apiKey.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <p className="text-sm font-medium text-zinc-900">{apiKey.name}</p>
                      <StatusBadge isActive={apiKey.isActive} />
                    </div>
                    <div className="flex items-center space-x-2 mb-2">
                      <code className="text-xs bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-600">
                        {apiKey.keyPreview}
                      </code>
                      <button 
                        onClick={() => copyToClipboard(apiKey.keyPreview)}
                        className="p-1 text-zinc-400 hover:text-zinc-600"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-zinc-500">
                      <span>权限: {apiKey.permissions}</span>
                      <span>最后使用: {apiKey.lastUsed ? new Date(apiKey.lastUsed).toLocaleDateString() : '从未使用'}</span>
                      <span>创建: {new Date(apiKey.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button className="p-1 text-zinc-400 hover:text-zinc-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatusBadgeProps {
  isActive: boolean
}

function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-sm ${
      isActive 
        ? 'bg-green-100 text-green-700' 
        : 'bg-zinc-100 text-zinc-700'
    }`}>
      {isActive ? '活跃' : '已禁用'}
    </span>
  )
}