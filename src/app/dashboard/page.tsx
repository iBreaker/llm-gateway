'use client'

import { useEffect, useState } from 'react'

interface DashboardStats {
  totalApiKeys: number
  activeAccounts: number
  totalRequests: number
  errorRate: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch('/api/dashboard/stats', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error('获取统计数据失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div>
        <h1 className="text-xl font-bold text-zinc-900">仪表盘</h1>
        <p className="text-sm text-zinc-600">LLM Gateway 系统概览</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="API Keys"
          value={stats?.totalApiKeys || 0}
        />
        <StatCard
          title="活跃账号"
          value={stats?.activeAccounts || 0}
        />
        <StatCard
          title="总请求数"
          value={stats?.totalRequests || 0}
        />
        <StatCard
          title="错误率"
          value={`${(stats?.errorRate || 0).toFixed(2)}%`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 快速操作 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">快速操作</h2>
          </div>
          <div className="p-4 space-y-3">
            <QuickActionCard
              title="创建 API Key"
              description="为用户生成新的 API 密钥"
              href="/dashboard/api-keys"
            />
            <QuickActionCard
              title="添加上游账号"
              description="添加 Claude Code 或 Gemini CLI 账号"
              href="/dashboard/accounts"
            />
            <QuickActionCard
              title="查看统计"
              description="查看详细的使用统计和分析"
              href="/dashboard/stats"
            />
          </div>
        </div>

        {/* 系统状态 */}
        <div className="bg-white border border-zinc-200 rounded-sm">
          <div className="p-4 border-b border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900">系统状态</h2>
          </div>
          <div className="p-4 space-y-3">
            <StatusItem label="数据库连接" status="正常" type="success" />
            <StatusItem label="Redis 缓存" status="正常" type="success" />
            <StatusItem label="上游服务" status="运行中" type="success" />
            <StatusItem label="代理服务" status="运行中" type="success" />
          </div>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
}

function StatCard({ title, value }: StatCardProps) {
  return (
    <div className="bg-white border border-zinc-200 rounded-sm p-4">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
      </div>
    </div>
  )
}

interface QuickActionCardProps {
  title: string
  description: string
  href: string
}

function QuickActionCard({ title, description, href }: QuickActionCardProps) {
  return (
    <a
      href={href}
      className="block p-3 border border-zinc-200 rounded-sm hover:bg-zinc-50 transition-colors"
    >
      <div>
        <h3 className="text-sm font-medium text-zinc-900">{title}</h3>
        <p className="text-xs text-zinc-600 mt-1">{description}</p>
      </div>
    </a>
  )
}

interface StatusItemProps {
  label: string
  status: string
  type: 'success' | 'warning' | 'error'
}

function StatusItem({ label, status, type }: StatusItemProps) {
  const statusClasses = {
    success: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700'
  }

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-zinc-700">{label}</span>
      <span className={`px-2 py-1 text-xs font-medium rounded-sm ${statusClasses[type]}`}>
        {status}
      </span>
    </div>
  )
}