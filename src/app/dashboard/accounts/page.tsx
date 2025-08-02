'use client'

import { useEffect, useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'

interface UpstreamAccount {
  id: string
  name: string
  type: string
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR'
  createdAt: string
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<UpstreamAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch('/api/dashboard/accounts', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          setAccounts(data.accounts || [])
        }
      } catch (error) {
        console.error('获取账号列表失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAccounts()
  }, [])

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
          <h1 className="text-xl font-bold text-zinc-900">上游账号</h1>
          <p className="text-sm text-zinc-600">管理 Claude Code 和 Gemini CLI 账号</p>
        </div>
        <button className="flex items-center px-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 transition-colors">
          <Plus className="w-4 h-4 mr-2" />
          添加账号
        </button>
      </div>

      {/* 账号列表 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        {accounts.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-600">暂无上游账号</p>
            <button className="mt-3 text-sm text-zinc-500 hover:text-zinc-700">
              添加第一个账号
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200">
            {accounts.map((account) => (
              <div key={account.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{account.name}</p>
                    <p className="text-xs text-zinc-500">{account.type}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <StatusBadge status={account.status} />
                  <button className="p-1 text-zinc-400 hover:text-zinc-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface StatusBadgeProps {
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR'
}

function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    ACTIVE: { label: '活跃', className: 'bg-green-100 text-green-700' },
    INACTIVE: { label: '非活跃', className: 'bg-zinc-100 text-zinc-700' },
    ERROR: { label: '错误', className: 'bg-red-100 text-red-700' }
  }

  const config = statusConfig[status]

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-sm ${config.className}`}>
      {config.label}
    </span>
  )
}