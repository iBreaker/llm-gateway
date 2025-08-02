'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BarChart3, Link as LinkIcon, Key, TrendingUp, Settings } from 'lucide-react'

interface User {
  id: string
  email: string
  username: string
  role: string
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token')
      if (!token) {
        router.push('/auth/login')
        return
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setUser(data.user)
        } else {
          localStorage.removeItem('token')
          router.push('/auth/login')
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        localStorage.removeItem('token')
        router.push('/auth/login')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  const handleLogout = () => {
    localStorage.removeItem('token')
    router.push('/auth/login')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-14">
            <h1 className="text-lg font-semibold text-zinc-900">
              LLM Gateway
            </h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-zinc-600">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="text-sm text-zinc-500 hover:text-zinc-700"
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* 侧边栏 */}
        <aside className="w-56 bg-white border-r border-zinc-200 min-h-[calc(100vh-56px)]">
          <nav className="p-4">
            <ul className="space-y-1">
              <li>
                <Link
                  href="/dashboard"
                  className="flex items-center px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <BarChart3 className="w-4 h-4 mr-3 text-zinc-400" />
                  仪表盘
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/accounts"
                  className="flex items-center px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <LinkIcon className="w-4 h-4 mr-3 text-zinc-400" />
                  上游账号
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/api-keys"
                  className="flex items-center px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <Key className="w-4 h-4 mr-3 text-zinc-400" />
                  API Keys
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/stats"
                  className="flex items-center px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <TrendingUp className="w-4 h-4 mr-3 text-zinc-400" />
                  使用统计
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/settings"
                  className="flex items-center px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  <Settings className="w-4 h-4 mr-3 text-zinc-400" />
                  系统配置
                </Link>
              </li>
            </ul>
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 p-6 bg-zinc-50">
          {children}
        </main>
      </div>
    </div>
  )
}