'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { CreateAccountData } from '@/types/accounts'
import { ProxyConfig, SystemProxyConfig } from '@/types/proxy'
import { OAuthFlow } from './OAuthFlow'
import { apiClient } from '@/utils/api'

interface CreateAccountModalProps {
  onClose: () => void
  onSubmit: (data: CreateAccountData) => Promise<void>
  isLoading: boolean
}

export function CreateAccountModal({ onClose, onSubmit, isLoading }: CreateAccountModalProps) {
  const [formData, setFormData] = useState<CreateAccountData>({
    name: '',
    serviceProvider: 'anthropic',
    authMethod: 'api_key',
  })
  
  const [availableProxies, setAvailableProxies] = useState<ProxyConfig[]>([])
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [selectedProxyId, setSelectedProxyId] = useState<string>('')

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
      // 失败时设置为空数组，而不是模拟数据
      setAvailableProxies([])
    }
  }

  // ESC键退出支持
  useEscapeKey(onClose)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('请输入账号名称')
      return
    }
    
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
    
    await onSubmit(dataWithProxy)
  }

  const handleCredentialChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleOAuthSuccess = () => {
    onClose()
    window.location.reload()
  }

  const renderCredentialFields = () => {
    const providerAuthKey = `${formData.serviceProvider}_${formData.authMethod}`
    
    switch (providerAuthKey) {
      case 'anthropic_api_key':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={formData.apiKey || ''}
                onChange={(e) => handleCredentialChange('apiKey', e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
                required
              />
              <p className="text-xs text-zinc-500 mt-1">
                从 Anthropic Console 获取的 API Key
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Base URL (可选)
              </label>
              <input
                type="url"
                value={formData.baseUrl || ''}
                onChange={(e) => handleCredentialChange('baseUrl', e.target.value)}
                placeholder="https://api.anthropic.com/v1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
              <p className="text-xs text-zinc-500 mt-1">
                API 服务的基础 URL，留空使用默认值
              </p>
            </div>
          </div>
        )

      case 'anthropic_oauth':
        return <OAuthFlow 
          onSuccess={handleOAuthSuccess} 
          onClose={onClose}
          proxyConfig={proxyEnabled ? {
            enabled: true,
            proxyId: selectedProxyId || null
          } : {
            enabled: false,
            proxyId: null
          }}
        />

      case 'openai_api_key':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={formData.apiKey || ''}
                onChange={(e) => handleCredentialChange('apiKey', e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
                required
              />
              <p className="text-xs text-zinc-500 mt-1">
                从 OpenAI 获取的 API Key
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Base URL (可选)
              </label>
              <input
                type="url"
                value={formData.baseUrl || ''}
                onChange={(e) => handleCredentialChange('baseUrl', e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
              />
            </div>
          </div>
        )

      default:
        return (
          <div className="text-sm text-zinc-500">
            暂不支持 {formData.serviceProvider} + {formData.authMethod} 的组合配置
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
          <div className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  服务提供商
                </label>
                <select
                  value={formData.serviceProvider}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    serviceProvider: e.target.value,
                    apiKey: '', // 重置凭据
                    baseUrl: ''
                  }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="qwen">Qwen</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  认证方式
                </label>
                <select
                  value={formData.authMethod}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    authMethod: e.target.value,
                    // 重置认证相关字段
                    apiKey: '',
                    oauthAccessToken: '',
                    oauthRefreshToken: '',
                    oauthExpiresAt: undefined,
                    oauthScopes: '',
                    baseUrl: '',
                    extraConfig: undefined
                  }))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
                >
                  <option value="api_key">API Key</option>
                  <option value="oauth">OAuth</option>
                </select>
              </div>
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

          {formData.serviceProvider !== 'anthropic' || formData.authMethod !== 'oauth' ? (
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
          ) : null}
        </form>
      </div>
    </div>
  )
}