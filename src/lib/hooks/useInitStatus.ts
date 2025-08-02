import { useState, useEffect, useCallback } from 'react'

interface InitStatus {
  initialized: boolean
  userCount: number
  needsInit: boolean
  initToken?: string
  tokenExpiry?: number
}

interface UseInitStatusResult {
  status: InitStatus | null
  loading: boolean
  error: string
  refetch: () => Promise<void>
}

/**
 * 系统初始化状态管理 Hook
 */
export function useInitStatus(): UseInitStatusResult {
  const [status, setStatus] = useState<InitStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      
      const response = await fetch('/api/init', {
        method: 'GET',
        cache: 'no-cache' // 避免缓存问题
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // 验证响应数据结构
      if (typeof data.initialized !== 'boolean' || typeof data.needsInit !== 'boolean') {
        throw new Error('无效的响应数据格式')
      }
      
      setStatus(data)
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '检查初始化状态失败'
      setError(errorMessage)
      console.error('获取初始化状态失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 组件挂载时获取状态，只执行一次
  useEffect(() => {
    fetchStatus()
  }, []) // 移除 fetchStatus 依赖，避免无限循环

  // 令牌过期检查
  useEffect(() => {
    if (!status?.initToken || !status?.tokenExpiry) return

    const checkExpiry = () => {
      if (Date.now() > status.tokenExpiry!) {
        setError('初始化令牌已过期，请刷新页面')
      }
    }

    // 立即检查
    checkExpiry()
    
    // 设置定时检查（每分钟）
    const interval = setInterval(checkExpiry, 60000)
    
    return () => clearInterval(interval)
  }, [status])

  return {
    status,
    loading,
    error,
    refetch: fetchStatus
  }
}

/**
 * 判断是否需要跳转到初始化页面
 */
export function shouldRedirectToInit(status: InitStatus | null): boolean {
  return status?.needsInit === true
}

/**
 * 判断是否需要跳转到登录页面  
 */
export function shouldRedirectToLogin(status: InitStatus | null): boolean {
  return status?.initialized === true
}