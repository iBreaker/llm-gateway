'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'

interface Account {
  id: string
  provider: 'claude' | 'gemini'
  name: string
  status: 'active' | 'inactive' | 'error'
  email?: string
  usage: {
    requests: number
    tokens: number
  }
  createdAt: string
  lastUsed?: string
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/dashboard/accounts')
      if (response.ok) {
        const data = await response.json()
        setAccounts(data)
      }
    } catch (error) {
      console.error('获取账号列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccountAdded = () => {
    fetchAccounts()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">账号管理</h1>
            <p className="mt-2 text-gray-600">管理您的上游服务账号</p>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
            添加账号
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-gray-500 mb-4">暂无账号</div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
              添加第一个账号
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts.map((account) => (
              <div key={account.id} className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-medium">{account.name}</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    account.status === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {account.status}
                  </span>
                </div>
                <p className="text-gray-600 text-sm">{account.provider}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}