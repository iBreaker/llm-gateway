'use client'

import DashboardLayout from '@/components/dashboard/DashboardLayout'
import StatCard from '@/components/ui/StatCard'
import Button from '@/components/ui/Button'
import AddAccountModal from '@/components/dashboard/AddAccountModal'
import { useState, useEffect } from 'react'

interface Account {
  id: string
  type: 'gemini_oauth' | 'claude_oauth' | 'llm_gateway'
  email?: string
  base_url?: string
  status: string
  lastUsed: string
  requestCount: number
  successRate: number
  createdAt: string
  health_status: 'healthy' | 'unhealthy' | 'unknown'
}

interface AccountStats {
  totalAccounts: number
  activeAccounts: number
  errorAccounts: number
  avgSuccessRate: number
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [stats, setStats] = useState<AccountStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [oauthMessage, setOauthMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  useEffect(() => {
    // 检查 OAuth 回调结果
    const urlParams = new URLSearchParams(window.location.search)
    const oauthSuccess = urlParams.get('oauth_success')
    const oauthError = urlParams.get('oauth_error')
    
    if (oauthSuccess) {
      const provider = urlParams.get('provider')
      const email = urlParams.get('email')
      setOauthMessage({ 
        type: 'success', 
        message: `${provider === 'claude' ? 'Claude' : 'Gemini'} OAuth 授权成功！账号 ${email} 已准备添加。` 
      })
      
      // 自动创建账号
      const accessToken = urlParams.get('access_token')
      const refreshToken = urlParams.get('refresh_token')
      const expiresIn = urlParams.get('expires_in')
      
      if (accessToken && refreshToken) {
        createOAuthAccount(provider as 'claude' | 'gemini', email || '', accessToken, refreshToken, parseInt(expiresIn || '3600'))
      }
      
      // 清理 URL 参数
      window.history.replaceState({}, '', window.location.pathname)
    } else if (oauthError) {
      setOauthMessage({ 
        type: 'error', 
        message: `OAuth 授权失败: ${decodeURIComponent(oauthError)}` 
      })
      
      // 清理 URL 参数
      window.history.replaceState({}, '', window.location.pathname)
    }

    async function fetchAccounts() {
      try {
        const response = await fetch('/api/dashboard/accounts')
        if (!response.ok) {
          throw new Error('获取账号数据失败')
        }
        const data = await response.json()
        setAccounts(data.accounts)
        setStats(data.stats)
      } catch (err) {
        setError(err instanceof Error ? err.message : '未知错误')
      } finally {
        setLoading(false)
      }
    }

    fetchAccounts()
  }, [])

  // 自动创建 OAuth 账号
  const createOAuthAccount = async (provider: 'claude' | 'gemini', email: string, accessToken: string, refreshToken: string, expiresIn: number) => {
    try {
      const response = await fetch('/api/dashboard/accounts/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: provider === 'claude' ? 'claude_oauth' : 'gemini_oauth',
          email: email,
          credentials: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
          },
          priority: 1,
          weight: 100
        })
      })

      if (response.ok) {
        setOauthMessage({ 
          type: 'success', 
          message: `${provider === 'claude' ? 'Claude' : 'Gemini'} 账号添加成功！` 
        })
        // 重新获取账号列表
        window.location.reload()
      } else {
        const errorData = await response.json()
        setOauthMessage({ 
          type: 'error', 
          message: `添加账号失败: ${errorData.error}` 
        })
      }
    } catch (error) {
      setOauthMessage({ 
        type: 'error', 
        message: `添加账号失败: ${error instanceof Error ? error.message : '未知错误'}` 
      })
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('确定要删除此账号吗？')) return
    
    try {
      const response = await fetch(`/api/dashboard/accounts/${accountId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        throw new Error('删除账号失败')
      }
      
      // 重新获取数据
      const updatedResponse = await fetch('/api/dashboard/accounts')
      const data = await updatedResponse.json()
      setAccounts(data.accounts)
      setStats(data.stats)
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const refreshData = async () => {
    const response = await fetch('/api/dashboard/accounts')
    const data = await response.json()
    setAccounts(data.accounts)
    setStats(data.stats)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">加载中...</div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">错误：{error}</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题和操作 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">上游账号管理</h1>
            <p className="text-gray-600 mt-2">管理上游API账号池</p>
          </div>
          <Button variant="primary" onClick={() => setShowAddModal(true)}>
            添加账号
          </Button>
        </div>

        {/* OAuth 消息提示 */}
        {oauthMessage && (
          <div className={`p-4 rounded-lg border ${
            oauthMessage.type === 'success' 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{oauthMessage.message}</p>
              <button
                onClick={() => setOauthMessage(null)}
                className={`text-sm px-2 py-1 rounded ${
                  oauthMessage.type === 'success'
                    ? 'text-green-600 hover:bg-green-100'
                    : 'text-red-600 hover:bg-red-100'
                }`}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard 
            title="总账号数" 
            value={stats?.totalAccounts?.toString() || '0'}
            color="blue"
          />
          <StatCard 
            title="活跃账号" 
            value={stats?.activeAccounts?.toString() || '0'}
            color="green"
          />
          <StatCard 
            title="异常账号" 
            value={stats?.errorAccounts?.toString() || '0'}
            color="red"
          />
          <StatCard 
            title="平均成功率" 
            value={`${stats?.avgSuccessRate?.toFixed(1) || '0'}%`}
            color="purple"
          />
        </div>

        {/* 账号列表 */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">账号列表</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">账号</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">请求数</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">成功率</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">最后使用</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      暂无账号数据
                    </td>
                  </tr>
                ) : (
                  accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {account.type === 'llm_gateway' 
                            ? account.base_url 
                            : (account.email || '未设置邮箱')
                          }
                        </div>
                        <div className="text-sm text-gray-500">创建于 {account.createdAt}</div>
                      </td>
                      <td className="px-6 py-4">
                        <TypeBadge type={account.type} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={account.status} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {account.requestCount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {account.successRate}%
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {account.lastUsed}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setEditingAccount(account)}
                          >
                            编辑
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteAccount(account.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 添加账号模态框 */}
        <AddAccountModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={refreshData}
        />
      </div>
    </DashboardLayout>
  )
}

// StatCard moved to shared component

function TypeBadge({ type }: { type: string }) {
  const typeConfig = {
    gemini_oauth: {
      color: 'bg-blue-100 text-blue-800',
      label: 'Gemini OAuth'
    },
    claude_oauth: {
      color: 'bg-orange-100 text-orange-800', 
      label: 'Claude OAuth'
    },
    llm_gateway: {
      color: 'bg-purple-100 text-purple-800',
      label: 'LLM Gateway'
    }
  }
  
  const config = typeConfig[type as keyof typeof typeConfig] || {
    color: 'bg-gray-100 text-gray-800',
    label: type
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.color}`}>
      {config.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  }
  
  const labels = {
    active: '正常',
    inactive: '闲置',
    error: '异常'
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
      {labels[status as keyof typeof labels]}
    </span>
  )
}