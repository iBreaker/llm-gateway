'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { CreateAccountData } from '@/types/accounts'
import { OAuthFlow } from './OAuthFlow'

interface CreateAccountModalProps {
  onClose: () => void
  onSubmit: (data: CreateAccountData) => Promise<void>
  isLoading: boolean
}

export function CreateAccountModal({ onClose, onSubmit, isLoading }: CreateAccountModalProps) {
  const [formData, setFormData] = useState<CreateAccountData>({
    name: '',
    type: 'API',
    provider: 'ANTHROPIC_API',
    credentials: {},
    priority: 1,
    weight: 1
  })

  // ESC键退出支持
  useEscapeKey(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('请输入账号名称')
      return
    }
    await onSubmit(formData)
  }

  const handleCredentialChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      credentials: {
        ...prev.credentials,
        [key]: value
      }
    }))
  }

  const handleOAuthSuccess = () => {
    onClose()
    window.location.reload()
  }

  const renderCredentialFields = () => {
    switch (formData.provider) {
      case 'ANTHROPIC_API':
        return (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={formData.credentials.session_key || ''}
              onChange={(e) => handleCredentialChange('session_key', e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              required
            />
            <p className="text-xs text-zinc-500 mt-1">
              从 Anthropic Console 获取的 API Key
            </p>
          </div>
        )

      case 'ANTHROPIC_OAUTH':
        return <OAuthFlow onSuccess={handleOAuthSuccess} onClose={onClose} />

      default:
        return (
          <div className="text-sm text-zinc-500">
            暂不支持此提供商的凭据配置
          </div>
        )
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">添加上游账号</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                账号名称
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：Anthropic API 1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                提供商
              </label>
              <select
                value={formData.provider}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  provider: e.target.value,
                  credentials: {} // 重置凭据
                }))}
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              >
                <option value="ANTHROPIC_API">Anthropic API</option>
                <option value="ANTHROPIC_OAUTH">Anthropic OAuth</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                优先级
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">1-10，数字越小优先级越高</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                权重
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({ ...prev, weight: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">负载均衡权重</p>
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4">
            <h3 className="text-sm font-medium text-zinc-900 mb-3">认证凭据</h3>
            {renderCredentialFields()}
          </div>

          {formData.provider !== 'ANTHROPIC_OAUTH' && (
            <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '创建中...' : '创建账号'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}