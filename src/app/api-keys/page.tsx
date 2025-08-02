'use client'

import { useEffect, useState } from 'react'
import { Plus, Key, Copy, Eye, EyeOff, Edit, Trash2, AlertCircle, CheckCircle, X } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  keyHash: string
  permissions: string[]
  rateLimits: {
    per_minute?: number
    per_hour?: number
  }
  isActive: boolean
  expiresAt: string | null
  lastUsedAt: string | null
  requestCount: number
  createdAt: string
}

interface CreateApiKeyData {
  name: string
  permissions: string[]
  rateLimits: {
    per_minute: number
    per_hour: number
  }
  expiresAt?: string
}

interface UpdateApiKeyData {
  name: string
  permissions: string[]
  rateLimits: {
    per_minute: number
    per_hour: number
  }
  isActive: boolean
  expiresAt?: string
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingApiKey, setEditingApiKey] = useState<ApiKey | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [newApiKey, setNewApiKey] = useState<string | null>(null)

  // 获取API Key列表
  const fetchApiKeys = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/api-keys', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setApiKeys(data.apiKeys || [])
      } else {
        console.error('获取API Key失败')
      }
    } catch (error) {
      console.error('获取API Key失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 创建API Key
  const createApiKey = async (apiKeyData: CreateApiKeyData) => {
    setIsCreating(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(apiKeyData)
      })

      const data = await response.json()

      if (response.ok) {
        setNewApiKey(data.plainKey) // 保存明文密钥用于显示
        await fetchApiKeys()
        setShowCreateModal(false)
        setMessage({ type: 'success', text: 'API Key创建成功' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: data.message || 'API Key创建失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setIsCreating(false)
    }
  }

  // 更新API Key
  const updateApiKey = async (id: string, apiKeyData: UpdateApiKeyData) => {
    setIsUpdating(true)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(apiKeyData)
      })

      const data = await response.json()

      if (response.ok) {
        await fetchApiKeys()
        setShowEditModal(false)
        setEditingApiKey(null)
        setMessage({ type: 'success', text: 'API Key更新成功' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: data.message || 'API Key更新失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setIsUpdating(false)
    }
  }

  // 删除API Key
  const deleteApiKey = async (id: string) => {
    if (!confirm('确定要删除这个API Key吗？此操作不可恢复。')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/api-keys/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        await fetchApiKeys()
        setMessage({ type: 'success', text: 'API Key删除成功' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.message || 'API Key删除失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // 切换密钥可见性
  const toggleKeyVisibility = (id: string) => {
    const newVisible = new Set(visibleKeys)
    if (newVisible.has(id)) {
      newVisible.delete(id)
    } else {
      newVisible.add(id)
    }
    setVisibleKeys(newVisible)
  }

  // 复制密钥
  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setMessage({ type: 'success', text: '密钥已复制到剪贴板' })
      setTimeout(() => setMessage(null), 2000)
    } catch (error) {
      setMessage({ type: 'error', text: '复制失败' })
      setTimeout(() => setMessage(null), 2000)
    }
  }

  useEffect(() => {
    fetchApiKeys()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center space-x-2 p-3 rounded-sm border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-700' 
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* 新创建的API Key显示 */}
      {newApiKey && (
        <div className="bg-blue-50 border border-blue-200 rounded-sm p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-blue-900">新API Key已创建</h3>
              <p className="text-xs text-blue-700 mt-1">请立即保存此密钥，它不会再次显示</p>
            </div>
            <button
              onClick={() => setNewApiKey(null)}
              className="text-blue-400 hover:text-blue-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 p-3 bg-white border border-blue-200 rounded-sm font-mono text-sm">
            <div className="flex items-center justify-between">
              <span className="break-all">{newApiKey}</span>
              <button
                onClick={() => copyKey(newApiKey)}
                className="ml-2 p-1 text-blue-600 hover:text-blue-800"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">API Keys</h1>
          <p className="text-sm text-zinc-600 mt-1">管理API访问密钥和权限</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          <span>创建API Key</span>
        </button>
      </div>

      {/* API Keys 表格 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  名称
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  密钥
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  权限
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  限流
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  使用量
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  最后使用
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {apiKeys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                    <Key className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
                    <p>暂无API Key</p>
                    <p className="text-xs mt-1">点击上方按钮创建第一个API Key</p>
                  </td>
                </tr>
              ) : (
                apiKeys.map((apiKey) => (
                  <tr key={apiKey.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{apiKey.name}</div>
                        <div className="text-xs text-zinc-500">
                          创建于 {new Date(apiKey.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <div className="font-mono text-sm">
                          {visibleKeys.has(apiKey.id) ? (
                            <span className="break-all">{apiKey.keyHash}</span>
                          ) : (
                            <span>sk-****...****</span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleKeyVisibility(apiKey.id)}
                          className="text-zinc-400 hover:text-zinc-600"
                        >
                          {visibleKeys.has(apiKey.id) ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        {visibleKeys.has(apiKey.id) && (
                          <button
                            onClick={() => copyKey(apiKey.keyHash)}
                            className="text-zinc-400 hover:text-zinc-600"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {apiKey.permissions.map((permission) => (
                          <span
                            key={permission}
                            className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-sm"
                          >
                            {permission}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900">
                        <div>{apiKey.rateLimits.per_minute || 0}/分钟</div>
                        <div className="text-xs text-zinc-500">
                          {apiKey.rateLimits.per_hour || 0}/小时
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge isActive={apiKey.isActive} expiresAt={apiKey.expiresAt} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-zinc-900">
                        {apiKey.requestCount.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-500">
                        {apiKey.lastUsedAt 
                          ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                          : '从未使用'
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            setEditingApiKey(apiKey)
                            setShowEditModal(true)
                          }}
                          className="text-zinc-400 hover:text-zinc-600"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteApiKey(apiKey.id)}
                          className="text-zinc-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 创建API Key模态框 */}
      {showCreateModal && (
        <CreateApiKeyModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={createApiKey}
          isLoading={isCreating}
        />
      )}

      {/* 编辑API Key模态框 */}
      {showEditModal && editingApiKey && (
        <EditApiKeyModal
          apiKey={editingApiKey}
          onClose={() => {
            setShowEditModal(false)
            setEditingApiKey(null)
          }}
          onSubmit={(apiKeyData) => updateApiKey(editingApiKey.id, apiKeyData)}
          isLoading={isUpdating}
        />
      )}
    </div>
  )
}

interface StatusBadgeProps {
  isActive: boolean
  expiresAt: string | null
}

function StatusBadge({ isActive, expiresAt }: StatusBadgeProps) {
  const now = new Date()
  const isExpired = expiresAt && new Date(expiresAt) < now

  if (isExpired) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-sm bg-red-100 text-red-700">
        已过期
      </span>
    )
  }

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

interface CreateApiKeyModalProps {
  onClose: () => void
  onSubmit: (apiKeyData: CreateApiKeyData) => void
  isLoading: boolean
}

function CreateApiKeyModal({ onClose, onSubmit, isLoading }: CreateApiKeyModalProps) {
  const [formData, setFormData] = useState<CreateApiKeyData>({
    name: '',
    permissions: ['anthropic.messages'],
    rateLimits: {
      per_minute: 100,
      per_hour: 1000
    },
    expiresAt: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = {
      ...formData,
      expiresAt: formData.expiresAt || undefined
    }
    onSubmit(submitData)
  }

  const availablePermissions = [
    'anthropic.messages',
    'openai.chat',
    'google.generate',
    'admin'
  ]

  const togglePermission = (permission: string) => {
    const newPermissions = formData.permissions.includes(permission)
      ? formData.permissions.filter(p => p !== permission)
      : [...formData.permissions, permission]
    setFormData({ ...formData, permissions: newPermissions })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">创建API Key</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              名称
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              placeholder="API Key名称"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              权限
            </label>
            <div className="space-y-2">
              {availablePermissions.map((permission) => (
                <label key={permission} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.permissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                    className="mr-2"
                  />
                  <span className="text-sm text-zinc-700">{permission}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                每分钟限制
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.rateLimits.per_minute}
                onChange={(e) => setFormData({
                  ...formData,
                  rateLimits: { ...formData.rateLimits, per_minute: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                每小时限制
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.rateLimits.per_hour}
                onChange={(e) => setFormData({
                  ...formData,
                  rateLimits: { ...formData.rateLimits, per_hour: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              过期时间 (可选)
            </label>
            <input
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-sm hover:bg-zinc-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading || formData.permissions.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLoading ? '创建中...' : '创建API Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditApiKeyModalProps {
  apiKey: ApiKey
  onClose: () => void
  onSubmit: (apiKeyData: UpdateApiKeyData) => void
  isLoading: boolean
}

function EditApiKeyModal({ apiKey, onClose, onSubmit, isLoading }: EditApiKeyModalProps) {
  const [formData, setFormData] = useState<UpdateApiKeyData & { expiresAt?: string }>({
    name: apiKey.name,
    permissions: apiKey.permissions,
    rateLimits: {
      per_minute: apiKey.rateLimits.per_minute || 100,
      per_hour: apiKey.rateLimits.per_hour || 1000
    },
    isActive: apiKey.isActive,
    expiresAt: apiKey.expiresAt ? apiKey.expiresAt.split('T')[0] + 'T' + apiKey.expiresAt.split('T')[1]?.slice(0, 5) : ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData = {
      name: formData.name,
      permissions: formData.permissions,
      rateLimits: formData.rateLimits,
      isActive: formData.isActive,
      expiresAt: formData.expiresAt || undefined
    }
    onSubmit(submitData)
  }

  const availablePermissions = [
    'anthropic.messages',
    'openai.chat',
    'google.generate',
    'admin'
  ]

  const togglePermission = (permission: string) => {
    const newPermissions = formData.permissions.includes(permission)
      ? formData.permissions.filter(p => p !== permission)
      : [...formData.permissions, permission]
    setFormData({ ...formData, permissions: newPermissions })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">编辑API Key</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              名称
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              权限
            </label>
            <div className="space-y-2">
              {availablePermissions.map((permission) => (
                <label key={permission} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.permissions.includes(permission)}
                    onChange={() => togglePermission(permission)}
                    className="mr-2"
                  />
                  <span className="text-sm text-zinc-700">{permission}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                每分钟限制
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.rateLimits.per_minute || 0}
                onChange={(e) => setFormData({
                  ...formData,
                  rateLimits: { ...formData.rateLimits, per_minute: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                每小时限制
              </label>
              <input
                type="number"
                min="1"
                required
                value={formData.rateLimits.per_hour || 0}
                onChange={(e) => setFormData({
                  ...formData,
                  rateLimits: { ...formData.rateLimits, per_hour: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              过期时间 (可选)
            </label>
            <input
              type="datetime-local"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm font-medium text-zinc-700">启用API Key</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-sm hover:bg-zinc-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading || formData.permissions.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLoading ? '更新中...' : '更新API Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}