'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useInitStatus } from '@/lib/hooks/useInitStatus'

interface InitResult {
  message: string
  initialized: boolean
  admin?: {
    id: string
    email: string
    username: string
    role: string
  }
  credentials?: {
    email: string
    password: string
    warning: string
  }
}

export default function InitPage() {
  const router = useRouter()
  const { status, loading: statusLoading, error: statusError, refetch } = useInitStatus()
  const [initLoading, setInitLoading] = useState(false)
  const [result, setResult] = useState<InitResult | null>(null)
  const [error, setError] = useState('')

  const handleInit = async () => {
    if (!status?.initToken) {
      setError('缺少初始化令牌，请刷新页面重试')
      return
    }

    setInitLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: status.initToken
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setResult(data)
      } else {
        if (data.error === 'INVALID_TOKEN') {
          setError('初始化令牌已过期，请刷新页面重新获取')
        } else {
          setError(data.message || '初始化失败')
        }
      }
    } catch (err) {
      setError('网络错误，请重试')
    } finally {
      setInitLoading(false)
    }
  }

  const goToLogin = () => {
    router.push('/auth/login')
  }

  // 显示加载状态
  if (statusLoading || !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">检查系统状态...</p>
        </div>
      </div>
    )
  }

  // 显示状态错误
  if (statusError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <span className="text-red-500 text-3xl">❌</span>
          <h3 className="mt-2 text-lg font-medium text-red-900">系统状态检查失败</h3>
          <p className="mt-2 text-sm text-red-700">{statusError}</p>
          <button
            onClick={refetch}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            🚀 LLM Gateway
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            系统初始化设置
          </p>
        </div>

        {/* 注意：已初始化的情况会被中间件重定向，这里不会显示 */}

        {/* 需要初始化状态 */}
        {status.needsInit && !result && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-6">
            <div className="text-center">
              <span className="text-blue-500 text-3xl">🔧</span>
              <h3 className="mt-2 text-lg font-medium text-blue-900">
                欢迎使用 LLM Gateway！
              </h3>
              <p className="mt-2 text-sm text-blue-700">
                检测到这是首次部署，需要创建管理员账号。
              </p>
              <p className="mt-1 text-xs text-blue-600">
                将创建默认管理员账号，请在登录后立即修改密码。
              </p>
              
              <button
                onClick={handleInit}
                disabled={initLoading}
                className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {initLoading ? '初始化中...' : '创建管理员账号'}
              </button>
            </div>
          </div>
        )}

        {/* 初始化成功结果 */}
        {result && (
          <div className="bg-green-50 border border-green-200 rounded-md p-6">
            <div className="text-center">
              <span className="text-green-500 text-3xl">🎉</span>
              <h3 className="mt-2 text-lg font-medium text-green-900">
                初始化成功！
              </h3>
              <p className="mt-2 text-sm text-green-700">
                {result.message}
              </p>
              
              {result.credentials && (
                <div className="mt-4 bg-white border border-green-300 rounded-md p-4">
                  <h4 className="font-medium text-green-900 mb-2">默认登录凭据：</h4>
                  <div className="text-left space-y-2 text-sm">
                    <div>
                      <span className="font-medium">邮箱：</span>
                      <code className="bg-gray-100 px-2 py-1 rounded ml-2">
                        {result.credentials.email}
                      </code>
                    </div>
                    <div>
                      <span className="font-medium">密码：</span>
                      <code className="bg-gray-100 px-2 py-1 rounded ml-2">
                        {result.credentials.password}
                      </code>
                    </div>
                  </div>
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    ⚠️ {result.credentials.warning}
                  </div>
                </div>
              )}
              
              <button
                onClick={goToLogin}
                className="mt-4 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                立即登录
              </button>
            </div>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-500 text-xl">❌</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  操作失败
                </h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
                <button
                  onClick={() => setError('')}
                  className="mt-2 text-sm text-red-600 hover:text-red-500"
                >
                  重试
                </button>
              </div>
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