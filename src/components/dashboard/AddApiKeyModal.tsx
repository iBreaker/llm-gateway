'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface AddApiKeyModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddApiKeyModal({ isOpen, onClose, onSuccess }: AddApiKeyModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    permissions: ['read'],
    is_active: true,
    expires_at: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/dashboard/api-keys/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          user_id: 1, // 暂时使用固定用户ID
          expires_at: formData.expires_at || null
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || '创建API密钥失败')
      }

      const result = await response.json()
      setNewApiKey(result.apiKey.key)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
    setNewApiKey(null)
    setFormData({
      name: '',
      permissions: ['read'],
      is_active: true,
      expires_at: ''
    })
    setError(null)
  }

  const copyToClipboard = async () => {
    if (newApiKey) {
      await navigator.clipboard.writeText(newApiKey)
      alert('API密钥已复制到剪贴板')
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={handleClose}></div>

        <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {newApiKey ? 'API密钥创建成功' : '创建API密钥'}
            </h3>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {newApiKey ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800 mb-2">
                  ⚠️ 请立即复制并保存此API密钥，它只会显示一次：
                </p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 px-2 py-1 bg-gray-100 text-sm font-mono rounded break-all">
                    {newApiKey}
                  </code>
                  <Button
                    size="sm"
                    onClick={copyToClipboard}
                  >
                    复制
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleClose}>
                  完成
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  密钥名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="例如：生产环境密钥"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  权限
                </label>
                <div className="space-y-2">
                  {['read', 'write', 'admin'].map((permission) => (
                    <label key={permission} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.permissions.includes(permission)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              permissions: [...formData.permissions, permission]
                            })
                          } else {
                            setFormData({
                              ...formData,
                              permissions: formData.permissions.filter(p => p !== permission)
                            })
                          }
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700 capitalize">{permission}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  过期时间 (可选)
                </label>
                <input
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
                  启用密钥
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={loading}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={loading}
                >
                  创建密钥
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}