'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Link as LinkIcon, Key, TrendingUp, Users, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface MainLayoutProps {
  children: React.ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, isLoading, logout } = useAuth()
  const pathname = usePathname()

  console.log('🎨 MainLayout: 渲染开始', { pathname, isLoading, user: !!user })

  // 如果是登录页面，不显示主布局 (处理带/不带尾部斜杠的情况)
  if (pathname === '/auth/login' || pathname === '/auth/login/') {
    console.log('✅ MainLayout: 登录页面，直接渲染children')
    return <>{children}</>
  }

  if (isLoading) {
    console.log('⏳ MainLayout: 正在加载中，显示loading界面')
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    )
  }

  if (!user) {
    console.log('❌ MainLayout: 没有用户信息，返回null')
    return null
  }

  console.log('✅ MainLayout: 渲染完整布局')

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
                onClick={logout}
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
                  href="/overview"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    pathname === '/overview'
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <BarChart3 className={`w-4 h-4 mr-3 ${
                    pathname === '/overview' ? 'text-zinc-600' : 'text-zinc-400'
                  }`} />
                  系统概览
                </Link>
              </li>
              <li>
                <Link
                  href="/accounts"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    pathname === '/accounts'
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <LinkIcon className={`w-4 h-4 mr-3 ${
                    pathname === '/accounts' ? 'text-zinc-600' : 'text-zinc-400'
                  }`} />
                  上游账号
                </Link>
              </li>
              <li>
                <Link
                  href="/api-keys"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    pathname === '/api-keys'
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Key className={`w-4 h-4 mr-3 ${
                    pathname === '/api-keys' ? 'text-zinc-600' : 'text-zinc-400'
                  }`} />
                  API Keys
                </Link>
              </li>
              <li>
                <Link
                  href="/stats"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    pathname === '/stats'
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <TrendingUp className={`w-4 h-4 mr-3 ${
                    pathname === '/stats' ? 'text-zinc-600' : 'text-zinc-400'
                  }`} />
                  使用统计
                </Link>
              </li>
              <li>
                <Link
                  href="/users"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    pathname === '/users'
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Users className={`w-4 h-4 mr-3 ${
                    pathname === '/users' ? 'text-zinc-600' : 'text-zinc-400'
                  }`} />
                  用户管理
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-sm transition-colors ${
                    pathname === '/settings'
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Settings className={`w-4 h-4 mr-3 ${
                    pathname === '/settings' ? 'text-zinc-600' : 'text-zinc-400'
                  }`} />
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