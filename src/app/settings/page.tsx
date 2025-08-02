'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'

interface Settings {
  rateLimiting: {
    enabled: boolean
    requestsPerMinute: number
    tokensPerMinute: number
  }
  monitoring: {
    enableMetrics: boolean
    enableLogs: boolean
    retentionDays: number
  }
  notifications: {
    emailAlerts: boolean
    webhookUrl?: string
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      // 模拟获取设置
      setSettings({
        rateLimiting: {
          enabled: true,
          requestsPerMinute: 100,
          tokensPerMinute: 10000
        },
        monitoring: {
          enableMetrics: true,
          enableLogs: true,
          retentionDays: 30
        },
        notifications: {
          emailAlerts: false,
          webhookUrl: ''
        }
      })
    } catch (error) {
      console.error('获取设置失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    
    setSaving(true)
    try {
      // 模拟保存设置
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('设置已保存:', settings)
    } catch (error) {
      console.error('保存设置失败:', error)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载设置失败</div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">系统设置</h1>
          <p className="mt-2 text-gray-600">配置系统行为和功能选项</p>
        </div>

        <div className="space-y-6">
          {/* 限流设置 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">限流设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">启用限流</label>
                <input
                  type="checkbox"
                  checked={settings.rateLimiting.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    rateLimiting: {
                      ...settings.rateLimiting,
                      enabled: e.target.checked
                    }
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              {settings.rateLimiting.enabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      每分钟请求限制
                    </label>
                    <input
                      type="number"
                      value={settings.rateLimiting.requestsPerMinute}
                      onChange={(e) => setSettings({
                        ...settings,
                        rateLimiting: {
                          ...settings.rateLimiting,
                          requestsPerMinute: parseInt(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      每分钟 Token 限制
                    </label>
                    <input
                      type="number"
                      value={settings.rateLimiting.tokensPerMinute}
                      onChange={(e) => setSettings({
                        ...settings,
                        rateLimiting: {
                          ...settings.rateLimiting,
                          tokensPerMinute: parseInt(e.target.value) || 0
                        }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 监控设置 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">监控设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">启用指标收集</label>
                <input
                  type="checkbox"
                  checked={settings.monitoring.enableMetrics}
                  onChange={(e) => setSettings({
                    ...settings,
                    monitoring: {
                      ...settings.monitoring,
                      enableMetrics: e.target.checked
                    }
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">启用日志记录</label>
                <input
                  type="checkbox"
                  checked={settings.monitoring.enableLogs}
                  onChange={(e) => setSettings({
                    ...settings,
                    monitoring: {
                      ...settings.monitoring,
                      enableLogs: e.target.checked
                    }
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  数据保留天数
                </label>
                <input
                  type="number"
                  value={settings.monitoring.retentionDays}
                  onChange={(e) => setSettings({
                    ...settings,
                    monitoring: {
                      ...settings.monitoring,
                      retentionDays: parseInt(e.target.value) || 0
                    }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 通知设置 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">通知设置</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">邮件告警</label>
                <input
                  type="checkbox"
                  checked={settings.notifications.emailAlerts}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      emailAlerts: e.target.checked
                    }
                  })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook URL
                </label>
                <input
                  type="url"
                  value={settings.notifications.webhookUrl || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      webhookUrl: e.target.value
                    }
                  })}
                  placeholder="https://example.com/webhook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 保存按钮 */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </MainLayout>
  )
}