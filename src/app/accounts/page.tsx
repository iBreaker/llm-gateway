'use client'

import { useEffect, useState } from 'react'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { Plus, Server, AlertCircle, CheckCircle, X, Eye, EyeOff, Edit, Trash2, Play, Pause, RefreshCw, Link, Copy, ExternalLink, Power, PowerOff } from 'lucide-react'

interface UpstreamAccount {
  id: number
  name: string
  type: string
  provider: string
  status: string
  is_active: boolean
  createdAt: string
  lastHealthCheck?: string
  requestCount: number
  successRate: number
}

interface CreateAccountData {
  name: string
  type: string
  provider: string
  credentials: any
  config?: {
    timeout?: number
    retry_count?: number
  }
  priority?: number
  weight?: number
}

interface UpdateAccountData {
  name: string
  is_active: boolean
  credentials?: any
}

interface OAuthSession {
  authUrl: string
  sessionId: string
  expiresAt: string
  instructions: string[]
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<UpstreamAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<UpstreamAccount | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [visibleCredentials, setVisibleCredentials] = useState<Set<string>>(new Set())
  const [selectedType, setSelectedType] = useState<string>('all')
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set())
  const [isTogglingStatus, setIsTogglingStatus] = useState<Set<string>>(new Set())

  // 获取上游账号列表
  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setAccounts(data.accounts || [])
      } else {
        console.error('获取上游账号失败')
      }
    } catch (error) {
      console.error('获取上游账号失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 创建上游账号
  const createAccount = async (accountData: CreateAccountData) => {
    setIsCreating(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accountData)
      })

      const data = await response.json()

      if (response.ok) {
        await fetchAccounts()
        setShowCreateModal(false)
        setMessage({ type: 'success', text: '上游账号创建成功' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: data.message || '上游账号创建失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setIsCreating(false)
    }
  }

  // 更新上游账号
  const updateAccount = async (id: string, accountData: UpdateAccountData) => {
    setIsUpdating(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accountData)
      })

      const data = await response.json()

      if (response.ok) {
        await fetchAccounts()
        setShowEditModal(false)
        setEditingAccount(null)
        setMessage({ type: 'success', text: '上游账号更新成功' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: data.message || '上游账号更新失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setIsUpdating(false)
    }
  }

  // 删除上游账号
  const deleteAccount = async (id: string) => {
    if (!confirm('确定要删除这个上游账号吗？此操作不可恢复。')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        await fetchAccounts()
        setMessage({ type: 'success', text: '上游账号删除成功' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.message || '上游账号删除失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // 手动健康检查
  const performHealthCheck = async (id: string) => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/accounts/${id}/health-check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        await fetchAccounts()
        setMessage({ type: 'success', text: '健康检查完成' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.message || '健康检查失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // 切换账号状态
  const toggleAccountStatus = async (id: string) => {
    setIsTogglingStatus(prev => {
      const newSet = new Set(prev)
      newSet.add(id)
      return newSet
    })
    
    try {
      const account = accounts.find(a => a.id === Number(id))
      if (!account) return

      const newStatus = account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: account.name,
          status: newStatus
        })
      })

      if (response.ok) {
        await fetchAccounts()
        const action = newStatus === 'ACTIVE' ? '启用' : '禁用'
        setMessage({ type: 'success', text: `账号已${action}` })
        setTimeout(() => setMessage(null), 3000)
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.message || '操作失败' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误' })
      setTimeout(() => setMessage(null), 3000)
    } finally {
      setIsTogglingStatus(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  // 批量操作
  const handleBatchOperation = async (operation: 'enable' | 'disable' | 'delete') => {
    if (selectedAccounts.size === 0) {
      setMessage({ type: 'error', text: '请选择要操作的账号' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    const accountIds = Array.from(selectedAccounts)
    const operationText = {
      enable: '启用',
      disable: '禁用', 
      delete: '删除'
    }[operation]

    if (!confirm(`确定要${operationText}选中的 ${accountIds.length} 个账号吗？`)) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      
      if (operation === 'delete') {
        // 批量删除
        for (const id of accountIds) {
          await fetch(`/api/accounts/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          })
        }
      } else {
        // 批量更新状态
        for (const id of accountIds) {
          const account = accounts.find(a => a.id === Number(id))
          if (!account) continue

          const newStatus = operation === 'enable' ? 'ACTIVE' : 'INACTIVE'
          
          await fetch(`/api/accounts/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              name: account.name,
              status: newStatus
            })
          })
        }
      }

      await fetchAccounts()
      setSelectedAccounts(new Set())
      setMessage({ type: 'success', text: `批量${operationText}完成` })
      setTimeout(() => setMessage(null), 3000)
    } catch (error) {
      setMessage({ type: 'error', text: '批量操作失败' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // 过滤账号
  const filteredAccounts = selectedType === 'all' 
    ? accounts 
    : accounts.filter(account => account.type === selectedType)

  useEffect(() => {
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
      {/* 消息提示 */}
      {message && (
        <div className={`flex items-center space-x-2 p-3 rounded-sm border ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-700' 
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">上游账号</h1>
          <p className="text-sm text-zinc-600 mt-1">管理Anthropic OAuth、Anthropic API等上游服务账号</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          <span>添加账号</span>
        </button>
      </div>

      {/* 过滤器和批量操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-zinc-700">类型筛选:</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-1 border border-zinc-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="all">全部</option>
            <option value="ANTHROPIC_API">Anthropic API</option>
            <option value="ANTHROPIC_OAUTH">Anthropic OAuth</option>
            <option value="GEMINI_CLI">Gemini CLI</option>
            <option value="OPENAI_API">OpenAI API</option>
          </select>
        </div>

        {/* 批量操作 */}
        {selectedAccounts.size > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-zinc-600">
              已选择 {selectedAccounts.size} 个账号
            </span>
            <button
              onClick={() => handleBatchOperation('enable')}
              className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white text-sm font-medium rounded-sm hover:bg-green-700"
            >
              <Power className="w-4 h-4" />
              <span>批量启用</span>
            </button>
            <button
              onClick={() => handleBatchOperation('disable')}
              className="flex items-center space-x-1 px-3 py-1 bg-orange-600 text-white text-sm font-medium rounded-sm hover:bg-orange-700"
            >
              <PowerOff className="w-4 h-4" />
              <span>批量禁用</span>
            </button>
            <button
              onClick={() => handleBatchOperation('delete')}
              className="flex items-center space-x-1 px-3 py-1 bg-red-600 text-white text-sm font-medium rounded-sm hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" />
              <span>批量删除</span>
            </button>
            <button
              onClick={() => setSelectedAccounts(new Set())}
              className="text-zinc-500 hover:text-zinc-700"
              title="清除选择"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 账号统计 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <div className="flex items-center">
            <Server className="w-5 h-5 text-zinc-400" />
            <span className="ml-2 text-sm font-medium text-zinc-600">总账号数</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{accounts.length}</p>
        </div>
        
        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="ml-2 text-sm font-medium text-zinc-600">活跃账号</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {accounts.filter(a => a.status === 'ACTIVE').length}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <div className="flex items-center">
            <PowerOff className="w-5 h-5 text-orange-500" />
            <span className="ml-2 text-sm font-medium text-zinc-600">禁用账号</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {accounts.filter(a => a.status === 'INACTIVE').length}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="ml-2 text-sm font-medium text-zinc-600">错误账号</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {accounts.filter(a => a.status === 'ERROR').length}
          </p>
        </div>

        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <div className="flex items-center">
            <RefreshCw className="w-5 h-5 text-blue-500" />
            <span className="ml-2 text-sm font-medium text-zinc-600">Anthropic账号</span>
          </div>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {accounts.filter(a => a.type === 'ANTHROPIC_API').length}
          </p>
        </div>
      </div>

      {/* 账号表格 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={filteredAccounts.length > 0 && selectedAccounts.size === filteredAccounts.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAccounts(new Set(filteredAccounts.map(a => String(a.id))))
                        } else {
                          setSelectedAccounts(new Set())
                        }
                      }}
                      className="w-4 h-4 text-zinc-600 bg-white border-zinc-300 rounded focus:ring-zinc-500"
                    />
                    <span>账号信息</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  类型
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  状态
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  优先级/权重
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  健康状态
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  使用统计
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                    <Server className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
                    <p>暂无上游账号</p>
                    <p className="text-xs mt-1">点击上方按钮添加第一个账号</p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((account) => (
                  <tr key={account.id} className={`hover:bg-zinc-50 ${account.status === 'INACTIVE' ? 'opacity-50 bg-zinc-25' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedAccounts.has(String(account.id))}
                          onChange={(e) => {
                            const newSelected = new Set(selectedAccounts)
                            if (e.target.checked) {
                              newSelected.add(String(account.id))
                            } else {
                              newSelected.delete(String(account.id))
                            }
                            setSelectedAccounts(newSelected)
                          }}
                          className="w-4 h-4 text-zinc-600 bg-white border-zinc-300 rounded focus:ring-zinc-500"
                        />
                        <div>
                          <div className={`text-sm font-medium ${account.status === 'INACTIVE' ? 'text-zinc-500' : 'text-zinc-900'}`}>
                            {account.name}
                          </div>
                          <div className="text-xs text-zinc-500">{account.provider} • {account.type}</div>
                          <div className="text-xs text-zinc-400 mt-1">
                            创建于 {new Date(account.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={account.type} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={account.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900">
                        <div>活跃状态</div>
                        <div className="text-xs text-zinc-500">{account.is_active ? '启用' : '禁用'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900">
                        <div>健康检查</div>
                        <div className="text-xs text-zinc-500">
                          {account.lastHealthCheck 
                            ? `最后检查: ${new Date(account.lastHealthCheck).toLocaleDateString()}`
                            : '未检查'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900">
                        <div>{account.requestCount.toLocaleString()} 请求</div>
                        <div className="text-xs text-zinc-500">
                          成功率: {account.successRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-zinc-400">
                          {account.lastHealthCheck 
                            ? `最后检查: ${new Date(account.lastHealthCheck).toLocaleDateString()}`
                            : '从未检查'
                          }
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => toggleAccountStatus(String(account.id))}
                          disabled={isTogglingStatus.has(String(account.id))}
                          className={`${
                            account.status === 'ACTIVE' 
                              ? 'text-zinc-400 hover:text-orange-600' 
                              : 'text-zinc-400 hover:text-green-600'
                          } disabled:opacity-50`}
                          title={account.status === 'ACTIVE' ? '禁用账号' : '启用账号'}
                        >
                          {isTogglingStatus.has(String(account.id)) ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : account.status === 'ACTIVE' ? (
                            <PowerOff className="w-4 h-4" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => performHealthCheck(String(account.id))}
                          className="text-zinc-400 hover:text-blue-600"
                          title="健康检查"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingAccount(account)
                            setShowEditModal(true)
                          }}
                          className="text-zinc-400 hover:text-zinc-600"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteAccount(String(account.id))}
                          className="text-zinc-400 hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 创建账号模态框 */}
      {showCreateModal && (
        <CreateAccountModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={createAccount}
          isLoading={isCreating}
        />
      )}

      {/* 编辑账号模态框 */}
      {showEditModal && editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => {
            setShowEditModal(false)
            setEditingAccount(null)
          }}
          onSubmit={(accountData) => updateAccount(String(editingAccount.id), accountData)}
          isLoading={isUpdating}
        />
      )}
    </div>
  )
}

// 状态徽章组件
interface StatusBadgeProps {
  status: string
}

function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    ACTIVE: { color: 'bg-green-100 text-green-700', text: '活跃' },
    INACTIVE: { color: 'bg-zinc-100 text-zinc-700', text: '停用' },
    ERROR: { color: 'bg-red-100 text-red-700', text: '错误' },
    PENDING: { color: 'bg-yellow-100 text-yellow-700', text: '待验证' }
  }

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-sm ${config.color}`}>
      {config.text}
    </span>
  )
}

// 类型徽章组件
interface TypeBadgeProps {
  type: string
}

function TypeBadge({ type }: TypeBadgeProps) {
  const typeConfig = {
    ANTHROPIC_API: { color: 'bg-purple-100 text-purple-700', text: 'Anthropic API' },
    ANTHROPIC_OAUTH: { color: 'bg-blue-100 text-blue-700', text: 'Anthropic OAuth' },
    GEMINI_CLI: { color: 'bg-green-100 text-green-700', text: 'Gemini CLI' },
    OPENAI_API: { color: 'bg-orange-100 text-orange-700', text: 'OpenAI' }
  }

  const config = typeConfig[type as keyof typeof typeConfig] || { color: 'bg-zinc-100 text-zinc-700', text: type }

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-sm ${config.color}`}>
      {config.text}
    </span>
  )
}

// 健康状态组件  
interface HealthStatusProps {
  healthStatus: {
    status?: string
    responseTime?: number
    error?: string
    lastCheck?: string
  }
}

function HealthStatus({ healthStatus }: HealthStatusProps) {
  if (!healthStatus.status) {
    return (
      <span className="px-2 py-1 text-xs font-medium rounded-sm bg-zinc-100 text-zinc-700">
        未检查
      </span>
    )
  }

  const isHealthy = healthStatus.status === 'success'
  
  return (
    <div>
      <span className={`px-2 py-1 text-xs font-medium rounded-sm ${
        isHealthy 
          ? 'bg-green-100 text-green-700' 
          : 'bg-red-100 text-red-700'
      }`}>
        {isHealthy ? '健康' : '异常'}
      </span>
      {healthStatus.responseTime && (
        <div className="text-xs text-zinc-500 mt-1">
          {healthStatus.responseTime}ms
        </div>
      )}
    </div>
  )
}

// 创建账号模态框
interface CreateAccountModalProps {
  onClose: () => void
  onSubmit: (accountData: CreateAccountData) => void
  isLoading: boolean
}

function CreateAccountModal({ onClose, onSubmit, isLoading }: CreateAccountModalProps) {
  const [formData, setFormData] = useState<CreateAccountData>({
    name: '',
    type: 'ANTHROPIC_API',
    provider: 'ANTHROPIC',
    credentials: {
      api_key: '',
      base_url: 'https://api.anthropic.com'
    },
    config: {
      timeout: 30000,
      retry_count: 3
    },
    priority: 1,
    weight: 100
  })

  // Claude Code OAuth 状态
  const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null)
  const [isGeneratingAuth, setIsGeneratingAuth] = useState(false)
  const [isExchangingCode, setIsExchangingCode] = useState(false)
  const [authorizationInput, setAuthorizationInput] = useState('')
  const [showOAuthFlow, setShowOAuthFlow] = useState(false)

  // ESC键退出支持
  useEscapeKey(onClose)

  // 生成 Claude Code OAuth 授权链接
  const generateOAuthUrl = async () => {
    setIsGeneratingAuth(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/accounts/oauth/anthropic/generate-auth-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      const data = await response.json()

      if (response.ok) {
        setOauthSession(data.data)
        setShowOAuthFlow(true)
      } else {
        alert(data.message || '生成授权链接失败')
      }
    } catch (error) {
      alert('网络错误')
    } finally {
      setIsGeneratingAuth(false)
    }
  }

  // 使用授权码交换访问令牌
  const exchangeAuthorizationCode = async () => {
    if (!oauthSession || !authorizationInput.trim()) {
      alert('请输入授权码或回调URL')
      return
    }

    setIsExchangingCode(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/accounts/oauth/anthropic/exchange-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId: oauthSession.sessionId,
          callbackUrl: authorizationInput.trim()
        })
      })

      const data = await response.json()

      if (response.ok) {
        // OAuth 成功，关闭模态框并刷新账号列表
        alert('Anthropic OAuth 账号添加成功！')
        onClose()
        window.location.reload() // 简单刷新页面
      } else {
        alert(data.message || '授权码交换失败')
      }
    } catch (error) {
      alert('网络错误')
    } finally {
      setIsExchangingCode(false)
    }
  }

  // 复制授权链接到剪贴板
  const copyAuthUrl = async () => {
    if (oauthSession) {
      try {
        await navigator.clipboard.writeText(oauthSession.authUrl)
        alert('授权链接已复制到剪贴板')
      } catch (error) {
        // 降级处理
        const textArea = document.createElement('textarea')
        textArea.value = oauthSession.authUrl
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        alert('授权链接已复制到剪贴板')
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">添加上游账号</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                账号名称
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                placeholder="Anthropic生产环境"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                账号类型
              </label>
              <select
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value as CreateAccountData['type']
                  const provider = newType.includes('ANTHROPIC') ? 'ANTHROPIC' : 
                                  newType.includes('GEMINI') ? 'GEMINI' : 
                                  newType.includes('OPENAI') ? 'OPENAI' : 'ANTHROPIC'
                  setFormData({ ...formData, type: newType, provider })
                }}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="ANTHROPIC_API">Anthropic API</option>
                <option value="ANTHROPIC_OAUTH">Anthropic OAuth</option>
                <option value="GEMINI_CLI">Gemini CLI</option>
                <option value="OPENAI_API">OpenAI API</option>
              </select>
            </div>
          </div>

          {formData.type === 'ANTHROPIC_OAUTH' && (
            <div className="bg-blue-50 border border-blue-200 rounded-sm p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Link className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-medium text-blue-900">Anthropic OAuth 授权</h3>
              </div>
              
              {!showOAuthFlow ? (
                <div>
                  <p className="text-sm text-blue-700 mb-3">
                    点击下方按钮生成授权链接，通过官方 OAuth 方式安全添加 Anthropic 账号
                  </p>
                  <button
                    type="button"
                    onClick={generateOAuthUrl}
                    disabled={isGeneratingAuth}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{isGeneratingAuth ? '生成中...' : '生成授权链接'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-900 mb-2">
                      步骤 1: 访问授权链接
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={oauthSession?.authUrl || ''}
                        readOnly
                        className="flex-1 px-3 py-2 border border-blue-200 rounded-sm bg-blue-50 text-sm"
                      />
                      <button
                        type="button"
                        onClick={copyAuthUrl}
                        className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-sm hover:bg-blue-700"
                      >
                        <Copy className="w-4 h-4" />
                        <span>复制</span>
                      </button>
                      <a
                        href={oauthSession?.authUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-sm hover:bg-blue-700"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>打开</span>
                      </a>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-900 mb-2">
                      步骤 2: 粘贴回调URL或授权码
                    </label>
                    <textarea
                      value={authorizationInput}
                      onChange={(e) => setAuthorizationInput(e.target.value)}
                      placeholder="完成授权后，复制浏览器地址栏中的完整URL或授权码到此处..."
                      rows={3}
                      className="w-full px-3 py-2 border border-blue-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-900 mb-1">
                      账号名称（可选）
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="例如：我的Anthropic账号"
                      className="w-full px-3 py-2 border border-blue-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={exchangeAuthorizationCode}
                    disabled={isExchangingCode || !authorizationInput.trim()}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>{isExchangingCode ? '添加中...' : '完成授权并添加账号'}</span>
                  </button>

                  <div className="text-xs text-blue-600 space-y-1">
                    {oauthSession?.instructions.map((instruction, index) => (
                      <div key={index}>• {instruction}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


          {formData.type === 'ANTHROPIC_API' && (
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  required
                  value={formData.credentials.api_key || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    credentials: { ...formData.credentials, api_key: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  placeholder="sk-ant-api03-..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  Base URL
                </label>
                <input
                  type="url"
                  required
                  value={formData.credentials.base_url || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    credentials: { ...formData.credentials, base_url: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                  placeholder="https://api.anthropic.com"
                />
              </div>
            </>
          )}

          {formData.type !== 'ANTHROPIC_OAUTH' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  优先级
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  权重
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>
            </div>
          )}

          {formData.type !== 'ANTHROPIC_OAUTH' && (
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-sm hover:bg-zinc-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {isLoading ? '创建中...' : '创建账号'}
              </button>
            </div>
          )}

          {formData.type === 'ANTHROPIC_OAUTH' && (
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-sm hover:bg-zinc-50"
              >
                关闭
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

// 编辑账号模态框
interface EditAccountModalProps {
  account: UpstreamAccount
  onClose: () => void
  onSubmit: (accountData: UpdateAccountData) => void
  isLoading: boolean
}

function EditAccountModal({ account, onClose, onSubmit, isLoading }: EditAccountModalProps) {
  const [formData, setFormData] = useState<UpdateAccountData>({
    name: account.name,
    is_active: account.is_active
  })

  // ESC键退出支持
  useEscapeKey(onClose)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">编辑上游账号</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              账号名称
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>




          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-sm hover:bg-zinc-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              {isLoading ? '更新中...' : '更新账号'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}