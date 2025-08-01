'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'

interface AddAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type AccountType = 'gemini_oauth' | 'claude_oauth' | 'llm_gateway'

interface FormData {
  type: AccountType
  email?: string
  base_url?: string
  access_token?: string
  refresh_token?: string
  api_key?: string
  priority: number
  weight: number
}

export default function AddAccountModal({ isOpen, onClose, onSuccess }: AddAccountModalProps) {
  const [formData, setFormData] = useState<FormData>({
    type: 'claude_oauth',
    email: '',
    priority: 1,
    weight: 100
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oauthMode, setOauthMode] = useState(false) // OAuth 模式 vs 手动输入模式

  // OAuth 授权处理
  const handleOAuthAuthorization = async (provider: 'claude' | 'gemini') => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/oauth/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'OAuth 授权初始化失败')
      }

      // 存储 OAuth 状态信息到 localStorage
      localStorage.setItem('oauth_state', JSON.stringify({
        provider: data.provider,
        state: data.state,
        codeVerifier: data.codeVerifier
      }))

      // 跳转到 OAuth 授权页面
      window.location.href = data.authUrl
    } catch (error) {
      console.error('OAuth 授权失败:', error)
      setError(error instanceof Error ? error.message : 'OAuth 授权失败')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // 构建请求数据
      const requestData: any = {
        type: formData.type,
        priority: formData.priority,
        weight: formData.weight
      }

      // 根据账号类型设置不同的数据结构
      switch (formData.type) {
        case 'gemini_oauth':
        case 'claude_oauth':
          if (!formData.access_token) {
            throw new Error('Access Token 是必需的')
          }
          if (!formData.refresh_token) {
            throw new Error('强烈建议提供 Refresh Token 以支持自动令牌刷新')
          }
          if (formData.email) {
            requestData.email = formData.email
          }
          requestData.credentials = {
            access_token: formData.access_token,
            refresh_token: formData.refresh_token,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 默认24小时后过期
          }
          break
        
        case 'llm_gateway':
          if (!formData.base_url || !formData.api_key) {
            throw new Error('请填写 Base URL 和 API Key')
          }
          requestData.base_url = formData.base_url
          requestData.credentials = {
            base_url: formData.base_url,
            api_key: formData.api_key,
            timeout: 30000,
            max_retries: 3
          }
          break
      }

      const response = await fetch('/api/dashboard/accounts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || '创建账号失败')
      }

      onSuccess()
      onClose()
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建账号失败')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormData({
      type: 'claude_oauth',
      email: '',
      priority: 1,
      weight: 100
    })
    setError(null)
  }

  const handleTypeChange = (type: AccountType) => {
    setFormData({
      type,
      priority: formData.priority,
      weight: formData.weight,
      email: '',
      base_url: '',
      access_token: '',
      refresh_token: '',
      api_key: ''
    })
  }

  const renderAccountTypeFields = () => {
    switch (formData.type) {
      case 'gemini_oauth':
        return (
          <>
            {/* OAuth 模式选择 */}
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-blue-900">添加 Gemini CLI 账号</h3>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setOauthMode(true)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      oauthMode 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    OAuth 授权
                  </button>
                  <button
                    type="button"
                    onClick={() => setOauthMode(false)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      !oauthMode 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-50'
                    }`}
                  >
                    手动输入
                  </button>
                </div>
              </div>
              
              {oauthMode ? (
                <div className="text-center">
                  <p className="text-sm text-blue-700 mb-3">
                    点击下方按钮跳转到 Google 进行 OAuth 授权
                  </p>
                  <Button
                    type="button"
                    onClick={() => handleOAuthAuthorization('gemini')}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {loading ? '处理中...' : '🔐 使用 Google OAuth 授权'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-blue-700">
                  手动输入从 Google OAuth 获取的 Token 信息
                </p>
              )}
            </div>

            {!oauthMode && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Google 账号邮箱
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="your.email@gmail.com (可选，用于识别账号)"
                  />
                  <p className="text-xs text-gray-500 mt-1">可选，用于管理界面显示和账号识别</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Token *
                  </label>
                  <textarea
                    value={formData.access_token || ''}
                    onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="从 Google OAuth 获取的访问令牌"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Refresh Token *
                  </label>
                  <textarea
                    value={formData.refresh_token || ''}
                    onChange={(e) => setFormData({ ...formData, refresh_token: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="从 Google OAuth 获取的刷新令牌（强烈建议）"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">强烈建议提供，用于自动刷新过期的 Access Token</p>
                </div>
              </>
            )}
          </>
        )

      case 'claude_oauth':
        return (
          <>
            {/* OAuth 模式选择 */}
            <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-orange-900">添加 Claude Code 账号</h3>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setOauthMode(true)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      oauthMode 
                        ? 'bg-orange-600 text-white' 
                        : 'bg-white border border-orange-300 text-orange-700 hover:bg-orange-50'
                    }`}
                  >
                    OAuth 授权
                  </button>
                  <button
                    type="button"
                    onClick={() => setOauthMode(false)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      !oauthMode 
                        ? 'bg-orange-600 text-white' 
                        : 'bg-white border border-orange-300 text-orange-700 hover:bg-orange-50'
                    }`}
                  >
                    手动输入
                  </button>
                </div>
              </div>
              
              {oauthMode ? (
                <div className="text-center">
                  <p className="text-sm text-orange-700 mb-3">
                    点击下方按钮跳转到 Claude 进行 OAuth 授权
                  </p>
                  <Button
                    type="button"
                    onClick={() => handleOAuthAuthorization('claude')}
                    disabled={loading}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    {loading ? '处理中...' : '🔐 使用 Claude OAuth 授权'}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-orange-700">
                  手动输入从 Claude OAuth 获取的 Token 信息
                </p>
              )}
            </div>

            {!oauthMode && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Claude 账号邮箱
                  </label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="your.email@example.com (可选，用于识别账号)"
                  />
                  <p className="text-xs text-gray-500 mt-1">可选，用于管理界面显示和账号识别</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Token *
                  </label>
                  <textarea
                    value={formData.access_token || ''}
                    onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    rows={3}
                    placeholder="从 Claude OAuth 获取的访问令牌"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Refresh Token *
                  </label>
                  <textarea
                    value={formData.refresh_token || ''}
                    onChange={(e) => setFormData({ ...formData, refresh_token: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    rows={3}
                    placeholder="从 Claude OAuth 获取的刷新令牌（强烈建议）"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">强烈建议提供，用于自动刷新过期的 Access Token</p>
                </div>
              </>
            )}
          </>
        )

      case 'llm_gateway':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base URL *
              </label>
              <input
                type="url"
                value={formData.base_url || ''}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="https://api.example.com"
                required
              />
              <p className="text-xs text-gray-500 mt-1">上游 LLM Gateway 的 API 地址</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key *
              </label>
              <input
                type="password"
                value={formData.api_key || ''}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="llmgw_xxxxxxxxxxxxxxxxx"
                required
              />
              <p className="text-xs text-gray-500 mt-1">上游系统的 API 密钥</p>
            </div>
          </>
        )
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">添加上游账号</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* 账号类型选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              账号类型 *
            </label>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="type"
                  value="claude_oauth"
                  checked={formData.type === 'claude_oauth'}
                  onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900">Claude OAuth</div>
                  <div className="text-sm text-gray-500">通过 OAuth 认证的 Claude Code 账号</div>
                </div>
              </label>
              
              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="type"
                  value="gemini_oauth"
                  checked={formData.type === 'gemini_oauth'}
                  onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900">Gemini OAuth</div>
                  <div className="text-sm text-gray-500">通过 Google OAuth 认证的 Gemini CLI 账号</div>
                </div>
              </label>
              
              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="type"
                  value="llm_gateway"
                  checked={formData.type === 'llm_gateway'}
                  onChange={(e) => handleTypeChange(e.target.value as AccountType)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900">LLM Gateway</div>
                  <div className="text-sm text-gray-500">上游 LLM Gateway 系统账号</div>
                </div>
              </label>
            </div>
          </div>

          {/* 动态字段 */}
          {renderAccountTypeFields()}

          {/* 优先级和权重 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                优先级
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">1-10，数字越大优先级越高</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                权重
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">负载均衡权重</p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-300 rounded-md">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t flex justify-end space-x-3">
          <Button 
            variant="ghost" 
            onClick={() => {
              onClose()
              resetForm()
            }}
            disabled={loading}
          >
            取消
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? '创建中...' : '创建账号'}
          </Button>
        </div>
      </div>
    </div>
  )
}