'use client'

import { useEffect, useState } from 'react'
import { Save, CheckCircle, AlertCircle, Info, Settings, Shield, Database, Zap, Bell, RefreshCw } from 'lucide-react'
import { apiClient } from '../../utils/api'

interface SystemSettings {
  // 基础设置（使用camelCase，因为API客户端会转换）
  systemName: string
  description: string
  maxUsers: number
  maxApiKeys: number
  
  // 安全设置
  passwordMinLength: number
  tokenExpiryHours: number
  maxLoginAttempts: number
  
  // 限流设置
  rateLimitPerMinute: number
  maxRequestsPerDay: number
  
  // 缓存设置
  cacheEnabled: boolean
  cacheTtlMinutes: number
  
  // 日志设置
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  logRetentionDays: number
  
  // 通知设置
  emailNotifications: boolean
  webhookNotifications: boolean
  alertThreshold: number
}

interface SaveStatus {
  type: 'success' | 'error' | null
  message: string
}

interface SystemInfo {
  version: string
  uptime?: string
  environment: string
  accountCount: number
  userCount: number
  totalRequests?: number
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    // 基础设置（使用camelCase）
    systemName: 'LLM Gateway',
    description: '智能大语言模型网关服务',
    maxUsers: 100,
    maxApiKeys: 1000,
    
    // 安全设置
    passwordMinLength: 8,
    tokenExpiryHours: 24,
    maxLoginAttempts: 5,
    
    // 限流设置
    rateLimitPerMinute: 60,
    maxRequestsPerDay: 10000,
    
    // 缓存设置
    cacheEnabled: true,
    cacheTtlMinutes: 30,
    
    // 日志设置
    logLevel: 'INFO',
    logRetentionDays: 30,
    
    // 通知设置
    emailNotifications: false,
    webhookNotifications: false,
    alertThreshold: 95
  })
  
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [activeTab, setActiveTab] = useState('basic')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ type: null, message: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      
      // 获取当前设置
      try {
        const settingsData = await apiClient.get<SystemSettings>('/api/settings')
        setSettings(settingsData)
      } catch (settingsError) {
        console.log('使用默认设置:', settingsError)
      }
      
      // 获取系统信息
      const [statsData, usersData, accountsData] = await Promise.all([
        apiClient.get<{totalRequests?: number}>('/api/stats/basic').catch(() => ({ totalRequests: 0 })),
        apiClient.get<{users?: any[]}>('/api/users').catch(() => ({ users: [] })),
        apiClient.get<{accounts?: any[]}>('/api/accounts').catch(() => ({ accounts: [] }))
      ])
      
      setSystemInfo({
        version: '0.1.0',
        environment: 'production',
        userCount: usersData.users?.length || 0,
        accountCount: accountsData.accounts?.length || 0,
        totalRequests: statsData.totalRequests || 0,
        uptime: '系统运行中'
      })
      
    } catch (error) {
      console.error('获取数据失败:', error)
      setError('获取数据失败')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSettingChange = (key: keyof SystemSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }))
    setSaveStatus({ type: null, message: '' })
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveStatus({ type: null, message: '' })
      
      // 调用后端API保存设置
      await apiClient.put('/api/settings', settings)
      
      setSaveStatus({ type: 'success', message: '设置已保存' })
      
      setTimeout(() => {
        setSaveStatus({ type: null, message: '' })
      }, 3000)
      
    } catch (error) {
      console.error('保存设置失败:', error)
      setSaveStatus({ type: 'error', message: '保存失败，请重试' })
    } finally {
      setIsSaving(false)
    }
  }

  const tabs = [
    { id: 'basic', name: '基础设置', icon: Settings },
    { id: 'security', name: '安全设置', icon: Shield },
    { id: 'limits', name: '限流配置', icon: Zap },
    { id: 'cache', name: '缓存配置', icon: Database },
    { id: 'notifications', name: '通知设置', icon: Bell },
    { id: 'system', name: '系统信息', icon: Info }
  ]

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
          <h1 className="text-xl font-bold text-zinc-900">系统设置</h1>
          <p className="text-sm text-zinc-600">配置系统参数和运行环境</p>
        </div>
        <div className="flex items-center space-x-3">
          {saveStatus.message && (
            <div className={`flex items-center px-3 py-1 text-sm rounded-sm ${
              saveStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {saveStatus.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 mr-2" />
              )}
              {saveStatus.message}
            </div>
          )}
          {error && (
            <div className="flex items-center px-3 py-1 text-sm rounded-sm bg-red-100 text-red-700">
              <AlertCircle className="w-4 h-4 mr-2" />
              {error}
            </div>
          )}
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.name}
              </button>
            )
          })}
        </nav>
      </div>

      {/* 标签页内容 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        {activeTab === 'basic' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">基础设置</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  系统名称
                </label>
                <input
                  type="text"
                  value={settings.systemName}
                  onChange={(e) => handleSettingChange('systemName', e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  系统描述
                </label>
                <input
                  type="text"
                  value={settings.description}
                  onChange={(e) => handleSettingChange('description', e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  最大用户数
                </label>
                <input
                  type="number"
                  value={settings.maxUsers}
                  onChange={(e) => handleSettingChange('maxUsers', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  最大API密钥数
                </label>
                <input
                  type="number"
                  value={settings.maxApiKeys}
                  onChange={(e) => handleSettingChange('maxApiKeys', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">安全设置</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  密码最小长度
                </label>
                <input
                  type="number"
                  min="6"
                  max="32"
                  value={settings.passwordMinLength}
                  onChange={(e) => handleSettingChange('passwordMinLength', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  令牌过期时间（小时）
                </label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.tokenExpiryHours}
                  onChange={(e) => handleSettingChange('tokenExpiryHours', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  最大登录尝试次数
                </label>
                <input
                  type="number"
                  min="3"
                  max="10"
                  value={settings.maxLoginAttempts}
                  onChange={(e) => handleSettingChange('maxLoginAttempts', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'limits' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">限流配置</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  每分钟最大请求数
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.rateLimitPerMinute}
                  onChange={(e) => handleSettingChange('rateLimitPerMinute', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  每日最大请求数
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.maxRequestsPerDay}
                  onChange={(e) => handleSettingChange('maxRequestsPerDay', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cache' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">缓存配置</h2>
            <div className="space-y-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="cacheEnabled"
                  checked={settings.cacheEnabled}
                  onChange={(e) => handleSettingChange('cacheEnabled', e.target.checked)}
                  className="h-4 w-4 text-zinc-600 focus:ring-zinc-500 border-zinc-300 rounded"
                />
                <label htmlFor="cacheEnabled" className="ml-2 text-sm font-medium text-zinc-700">
                  启用缓存
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    缓存TTL（分钟）
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={settings.cacheTtlMinutes}
                    onChange={(e) => handleSettingChange('cacheTtlMinutes', parseInt(e.target.value))}
                    disabled={!settings.cacheEnabled}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">通知设置</h2>
            <div className="space-y-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="emailNotifications"
                  checked={settings.emailNotifications}
                  onChange={(e) => handleSettingChange('emailNotifications', e.target.checked)}
                  className="h-4 w-4 text-zinc-600 focus:ring-zinc-500 border-zinc-300 rounded"
                />
                <label htmlFor="emailNotifications" className="ml-2 text-sm font-medium text-zinc-700">
                  启用邮件通知
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="webhookNotifications"
                  checked={settings.webhookNotifications}
                  onChange={(e) => handleSettingChange('webhookNotifications', e.target.checked)}
                  className="h-4 w-4 text-zinc-600 focus:ring-zinc-500 border-zinc-300 rounded"
                />
                <label htmlFor="webhookNotifications" className="ml-2 text-sm font-medium text-zinc-700">
                  启用Webhook通知
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    告警阈值（%）
                  </label>
                  <input
                    type="number"
                    min="50"
                    max="99"
                    value={settings.alertThreshold}
                    onChange={(e) => handleSettingChange('alertThreshold', parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">系统信息</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      系统版本
                    </label>
                    <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                      {systemInfo?.version || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      运行环境
                    </label>
                    <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                      {systemInfo?.environment || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      用户数量
                    </label>
                    <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                      {systemInfo?.userCount || 0}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      上游账号数量
                    </label>
                    <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                      {systemInfo?.accountCount || 0}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    总请求数
                  </label>
                  <div className="text-sm text-zinc-900 font-mono bg-zinc-50 px-2 py-1 rounded">
                    {systemInfo?.totalRequests?.toLocaleString() || 0}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    系统状态
                  </label>
                  <div className="text-sm text-zinc-900 bg-green-50 text-green-700 px-2 py-1 rounded">
                    ✅ {systemInfo?.uptime || '运行中'}
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-base font-semibold text-zinc-900 mb-4">服务状态</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">认证服务</span>
                    </div>
                    <span className="text-xs text-gray-500">正常</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">账号管理</span>
                    </div>
                    <span className="text-xs text-gray-500">正常</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">统计服务</span>
                    </div>
                    <span className="text-xs text-gray-500">正常</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm font-medium">代理服务</span>
                    </div>
                    <span className="text-xs text-gray-500">正常</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}