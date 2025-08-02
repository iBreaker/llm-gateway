'use client'

import { useEffect, useState } from 'react'
import { Save, CheckCircle, AlertCircle } from 'lucide-react'

interface SystemConfig {
  [key: string]: any
}

interface SaveStatus {
  type: 'success' | 'error' | null
  message: string
}

export default function SettingsPage() {
  const [config, setConfig] = useState<SystemConfig>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: null, message: '' })

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch('/api/config', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setConfig(data.config || {})
        } else {
          const data = await response.json()
          setSaveStatus({
            type: 'error',
            message: data.message || '获取配置失败'
          })
        }
      } catch (error) {
        console.error('获取系统配置失败:', error)
        setSaveStatus({
          type: 'error',
          message: '网络错误，请重试'
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchConfig()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus({ type: null, message: '' })
    
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ config })
      })

      const data = await response.json()

      if (response.ok) {
        setSaveStatus({
          type: 'success',
          message: `配置保存成功，更新了 ${data.updated?.length || 0} 项配置`
        })
        // 更新本地配置为服务器返回的最新值
        setConfig(data.config)
      } else {
        setSaveStatus({
          type: 'error',
          message: data.message || '保存失败'
        })
      }
    } catch (error) {
      console.error('保存配置失败:', error)
      setSaveStatus({
        type: 'error',
        message: '网络错误，请重试'
      })
    } finally {
      setIsSaving(false)
      // 3秒后清除状态提示
      setTimeout(() => {
        setSaveStatus({ type: null, message: '' })
      }, 3000)
    }
  }

  const updateConfig = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }))
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
          <h1 className="text-xl font-bold text-zinc-900">系统配置</h1>
          <p className="text-sm text-zinc-600">管理系统参数和功能设置</p>
        </div>
        <div className="flex items-center space-x-3">
          {saveStatus.type && (
            <div className={`flex items-center px-3 py-1 text-sm rounded-sm ${
              saveStatus.type === 'success' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {saveStatus.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 mr-2" />
              )}
              {saveStatus.message}
            </div>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center px-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基础设置 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">基础设置</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                系统名称
              </label>
              <input
                type="text"
                value={config.systemName || ''}
                onChange={(e) => updateConfig('systemName', e.target.value)}
                placeholder="LLM Gateway"
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                最大并发请求数 (1-1000)
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={config.maxConcurrentRequests || ''}
                onChange={(e) => updateConfig('maxConcurrentRequests', parseInt(e.target.value) || 100)}
                placeholder="100"
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                请求超时时间 (1-300秒)
              </label>
              <input
                type="number"
                min="1"
                max="300"
                value={config.requestTimeout || ''}
                onChange={(e) => updateConfig('requestTimeout', parseInt(e.target.value) || 30)}
                placeholder="30"
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          </div>
        </div>

        {/* 安全设置 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">安全设置</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.enableRateLimit || false}
                  onChange={(e) => updateConfig('enableRateLimit', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-zinc-700">启用请求频率限制</span>
              </label>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.enableAuditLog || false}
                  onChange={(e) => updateConfig('enableAuditLog', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-zinc-700">启用审计日志</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                允许的来源域名
              </label>
              <textarea
                value={config.allowedOrigins || ''}
                onChange={(e) => updateConfig('allowedOrigins', e.target.value)}
                placeholder="每行一个域名，例如：https://example.com"
                rows={3}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          </div>
        </div>

        {/* 缓存设置 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">缓存设置</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.enableCache || false}
                  onChange={(e) => updateConfig('enableCache', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-zinc-700">启用响应缓存</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                缓存过期时间 (1-1440分钟)
              </label>
              <input
                type="number"
                min="1"
                max="1440"
                value={config.cacheExpiration || ''}
                onChange={(e) => updateConfig('cacheExpiration', parseInt(e.target.value) || 60)}
                placeholder="60"
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500"
                disabled={!config.enableCache}
              />
            </div>
          </div>
        </div>

        {/* 监控设置 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">监控设置</h2>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={config.enableMetrics || false}
                  onChange={(e) => updateConfig('enableMetrics', e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-zinc-700">启用性能指标收集</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                指标保留天数 (1-365天)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={config.metricsRetentionDays || ''}
                onChange={(e) => updateConfig('metricsRetentionDays', parseInt(e.target.value) || 30)}
                placeholder="30"
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:bg-zinc-100 disabled:text-zinc-500"
                disabled={!config.enableMetrics}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}