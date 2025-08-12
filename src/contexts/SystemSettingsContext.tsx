'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { apiClient } from '@/utils/api'

interface SystemSettings {
  systemName: string
  description: string
  maxUsers: number
  maxApiKeys: number
  passwordMinLength: number
  tokenExpiryHours: number
  maxLoginAttempts: number
  rateLimitPerMinute: number
  maxRequestsPerDay: number
  cacheEnabled: boolean
  cacheTtlMinutes: number
  logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  logRetentionDays: number
  emailNotifications: boolean
  webhookNotifications: boolean
  alertThreshold: number
}

interface SystemSettingsContextType {
  settings: SystemSettings | null
  isLoading: boolean
  refreshSettings: () => Promise<void>
}

const defaultSettings: SystemSettings = {
  systemName: 'LLM Gateway',
  description: '智能大语言模型网关服务',
  maxUsers: 100,
  maxApiKeys: 1000,
  passwordMinLength: 8,
  tokenExpiryHours: 24,
  maxLoginAttempts: 5,
  rateLimitPerMinute: 60,
  maxRequestsPerDay: 10000,
  cacheEnabled: true,
  cacheTtlMinutes: 30,
  logLevel: 'INFO',
  logRetentionDays: 30,
  emailNotifications: false,
  webhookNotifications: false,
  alertThreshold: 95
}

const SystemSettingsContext = createContext<SystemSettingsContextType>({
  settings: null,
  isLoading: true,
  refreshSettings: async () => {}
})

export function useSystemSettings() {
  const context = useContext(SystemSettingsContext)
  if (!context) {
    throw new Error('useSystemSettings must be used within a SystemSettingsProvider')
  }
  return context
}

interface SystemSettingsProviderProps {
  children: ReactNode
}

export function SystemSettingsProvider({ children }: SystemSettingsProviderProps) {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshSettings = async () => {
    // 检查是否有认证token，没有则使用默认设置
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.log('🔍 SystemSettings: 没有认证token，使用默认设置')
      setSettings(defaultSettings)
      setIsLoading(false)
      return
    }

    try {
      console.log('🔍 SystemSettings: 获取系统设置')
      const settingsData = await apiClient.get<SystemSettings>('/api/settings')
      setSettings(settingsData)
    } catch (error) {
      console.error('获取系统设置失败，使用默认设置:', error)
      setSettings(defaultSettings)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    refreshSettings()
  }, [])

  return (
    <SystemSettingsContext.Provider value={{ settings, isLoading, refreshSettings }}>
      {children}
    </SystemSettingsContext.Provider>
  )
}