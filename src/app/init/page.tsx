'use client'

import { useState, useEffect } from 'react'
import { apiClient } from '../../utils/api'

interface InitData {
  initialized: boolean
  userCount: number
  needsInit: boolean
  initToken?: string
  tokenExpiry?: number
}

export default function InitPageDebug() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<InitData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    checkInitStatus()
  }, [])

  const checkInitStatus = async () => {
    try {
      // 尝试获取系统健康状态，如果有用户则认为已初始化
      const healthData = await apiClient.get<{users?: any[]}>('/api/health/system')
      
      // 检查用户数量决定是否需要初始化
      const userCount = healthData.users?.length || 0
      
      setData({
        initialized: userCount > 0,
        userCount,
        needsInit: userCount === 0
      })
    } catch (error) {
      // 如果API调用失败，假设需要初始化
      console.error('检查初始化状态失败:', error)
      setData({
        initialized: false,
        userCount: 0,
        needsInit: true
      })
    } finally {
      setLoading(false)
    }
  }

  console.log('组件渲染，当前状态:', { loading, data, error })

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">检查系统状态...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl text-red-600">错误</h1>
          <p className="mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
          >
            刷新页面
          </button>
        </div>
      </div>
    )
  }

  const handleInit = async () => {
    setLoading(true)
    setError('')
    
    try {
      // 创建管理员用户
      await apiClient.post('/api/users', {
        username: 'admin',
        email: 'admin@llm-gateway.com',
        password: 'admin123',
        isActive: true
      })
      
      alert(`初始化成功！\n管理员账号已创建:\n邮箱: admin@llm-gateway.com\n密码: admin123\n\n请使用这些凭据登录。`)
      window.location.href = '/auth/login'
    } catch (err) {
      console.error('初始化失败:', err)
      setError(err instanceof Error ? err.message : '初始化失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">🚀 LLM Gateway</h1>
          <p className="mt-2 text-sm text-gray-600">系统初始化设置</p>
          <p className="mt-1 text-xs text-gray-500">
            调试: needsInit={String(data?.needsInit)}, userCount={data?.userCount}
          </p>
        </div>

        {data?.needsInit && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="text-center">
              <span className="text-blue-500 text-3xl">🔧</span>
              <h3 className="mt-2 text-lg font-medium text-blue-900">
                欢迎使用 LLM Gateway！
              </h3>
              <p className="mt-2 text-sm text-blue-700">
                检测到这是首次部署，需要创建管理员账号。
              </p>
              
              <button
                onClick={handleInit}
                disabled={loading}
                className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '创建中...' : '创建管理员账号'}
              </button>
            </div>
          </div>
        )}

        {!data?.needsInit && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="text-center">
              <span className="text-green-500 text-3xl">✅</span>
              <h3 className="mt-2 text-lg font-medium text-green-900">
                系统已初始化
              </h3>
              <p className="mt-2 text-sm text-green-700">
                系统已经设置完成，请前往登录页面。
              </p>
              <button
                onClick={() => window.location.href = '/auth/login'}
                className="mt-4 w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
              >
                前往登录
              </button>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-gray-500">
            LLM Gateway v0.1.0 - 智能大语言模型网关服务
          </p>
        </div>
      </div>
    </div>
  )
}