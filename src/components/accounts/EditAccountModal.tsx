'use client'

import { useState, useEffect } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { UpstreamAccount, UpdateAccountData, AccountProxyConfig } from '@/types/accounts'
import { ProxyConfig, SystemProxyConfig } from '@/types/proxy'
import { apiClient } from '@/utils/api'

interface EditAccountModalProps {
  account: UpstreamAccount
  onClose: () => void
  onSubmit: (id: number, data: UpdateAccountData) => Promise<void>
  isLoading: boolean
}

export function EditAccountModal({ account, onClose, onSubmit, isLoading }: EditAccountModalProps) {
  const [formData, setFormData] = useState<UpdateAccountData>({
    name: account.name,
    is_active: account.isActive,
    credentials: {}
  })

  const [showCredentials, setShowCredentials] = useState(false)
  const [availableProxies, setAvailableProxies] = useState<ProxyConfig[]>([])
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [selectedProxyId, setSelectedProxyId] = useState<string>('')

  // 初始化代理配置状态
  useEffect(() => {
    if (account.proxyConfig) {
      setProxyEnabled(account.proxyConfig.enabled)
      setSelectedProxyId(account.proxyConfig.proxyId || '')
    }
  }, [account])

  // 加载可用的代理配置
  useEffect(() => {
    loadAvailableProxies()
  }, [])

  const loadAvailableProxies = async () => {
    try {
      const data = await apiClient.get<SystemProxyConfig>('/api/proxies')
      
      // 将后端返回的代理配置转换为数组格式，只保留启用的代理
      const proxies: ProxyConfig[] = Object.values(data.proxies || {})
        .filter((proxy: ProxyConfig) => proxy.enabled)
      
      setAvailableProxies(proxies)
    } catch (error) {
      console.error('加载代理配置失败:', error)
      // 失败时设置为空数组
      setAvailableProxies([])
    }
  }

  // ESC键退出支持
  useEscapeKey(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 包含代理配置的数据
    const dataWithProxy = {
      ...formData,
      proxyConfig: proxyEnabled ? {
        enabled: true,
        proxyId: selectedProxyId || null
      } : {
        enabled: false,
        proxyId: null
      }
    }
    
    await onSubmit(account.id, dataWithProxy)
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

  const renderCredentialFields = () => {
    switch (account.serviceProvider) {
      case 'anthropic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showCredentials ? 'text' : 'password'}
                  value={formData.credentials?.session_key || ''}
                  onChange={(e) => handleCredentialChange('session_key', e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-sm text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCredentials(!showCredentials)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showCredentials ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                留空则保持原有凭据不变
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Base URL (可选)
              </label>
              <input
                type="url"
                value={formData.credentials?.base_url || ''}
                onChange={(e) => handleCredentialChange('base_url', e.target.value)}
                placeholder="https://api.anthropic.com/v1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                API 服务的基础 URL，留空保持当前配置不变
              </p>
            </div>
          </div>
        )

      case 'anthropic_oauth':
        return (
          <div className="bg-blue-50 border border-blue-200 rounded-sm p-4">
            <p className="text-sm text-blue-800">
              OAuth 账号的凭据由系统自动管理，无需手动编辑。
            </p>
          </div>
        )

      case 'openai':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showCredentials ? 'text' : 'password'}
                  value={formData.credentials?.api_key || ''}
                  onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-sm text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCredentials(!showCredentials)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showCredentials ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                留空则保持原有凭据不变
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Base URL (可选)
              </label>
              <input
                type="url"
                value={formData.credentials?.base_url || ''}
                onChange={(e) => handleCredentialChange('base_url', e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                API 服务的基础 URL，留空保持当前配置不变
              </p>
            </div>
          </div>
        )

      case 'gemini':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showCredentials ? 'text' : 'password'}
                  value={formData.credentials?.api_key || ''}
                  onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                  placeholder="AI..."
                  className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-sm text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCredentials(!showCredentials)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showCredentials ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                留空则保持原有凭据不变
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Base URL (可选)
              </label>
              <input
                type="url"
                value={formData.credentials?.base_url || ''}
                onChange={(e) => handleCredentialChange('base_url', e.target.value)}
                placeholder="https://generativelanguage.googleapis.com/v1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                API 服务的基础 URL，留空保持当前配置不变
              </p>
            </div>
          </div>
        )

      case 'qwen':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showCredentials ? 'text' : 'password'}
                  value={formData.credentials?.api_key || ''}
                  onChange={(e) => handleCredentialChange('api_key', e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-sm text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowCredentials(!showCredentials)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showCredentials ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                留空则保持原有凭据不变
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Base URL (可选)
              </label>
              <input
                type="url"
                value={formData.credentials?.base_url || ''}
                onChange={(e) => handleCredentialChange('base_url', e.target.value)}
                placeholder="https://dashscope.aliyuncs.com/v1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                API 服务的基础 URL，留空保持当前配置不变
              </p>
            </div>
          </div>
        )

      default:
        return (
          <div className="text-sm text-zinc-500">
            暂不支持编辑此提供商的凭据
          </div>
        )
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">编辑账号</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              账号名称
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="rounded border-zinc-300"
              />
              <span className="text-sm font-medium text-zinc-700">启用账号</span>
            </label>
            <p className="text-xs text-zinc-500 mt-1">
              禁用后此账号将不会被用于请求处理
            </p>
          </div>

          {/* 代理配置 */}
          <div className="border-t border-zinc-200 pt-4">
            <h3 className="text-sm font-medium text-zinc-900 mb-3">代理设置</h3>
            
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="proxy-enabled"
                  checked={proxyEnabled}
                  onChange={(e) => setProxyEnabled(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-zinc-300 rounded"
                />
                <label htmlFor="proxy-enabled" className="ml-2 text-sm text-zinc-700">
                  为此账号启用代理
                </label>
              </div>

              {proxyEnabled && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    选择代理
                  </label>
                  <select
                    value={selectedProxyId}
                    onChange={(e) => setSelectedProxyId(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
                  >
                    <option value="">使用系统默认代理</option>
                    {availableProxies.filter(proxy => proxy.enabled).map(proxy => (
                      <option key={proxy.id} value={proxy.id}>
                        {proxy.name} ({proxy.proxyType.toUpperCase()} - {proxy.host}:{proxy.port})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-500 mt-1">
                    {selectedProxyId ? 
                      '使用指定的代理服务器进行连接' : 
                      '使用系统默认代理，如果没有配置默认代理则直连'
                    }
                  </p>
                  
                  {availableProxies.length === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">
                      暂无可用的代理配置，请先在代理设置页面添加代理
                    </p>
                  )}
                </div>
              )}

              {!proxyEnabled && (
                <p className="text-xs text-zinc-500">
                  账号将使用直连模式，不通过代理服务器
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4">
            <h3 className="text-sm font-medium text-zinc-900 mb-3">认证凭据</h3>
            {renderCredentialFields()}
          </div>

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
              {isLoading ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}