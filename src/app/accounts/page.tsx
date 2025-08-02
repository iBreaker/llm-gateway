'use client'

import { useEffect, useState } from 'react'
import { Plus, Server, AlertCircle, CheckCircle, X, Eye, EyeOff, Edit, Trash2, Play, Pause, RefreshCw } from 'lucide-react'

interface UpstreamAccount {
  id: string
  name: string
  type: 'ANTHROPIC_API' | 'CLAUDE_CODE' | 'GEMINI_CLI' | 'OPENAI_API'
  email: string | null
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING'
  priority: number
  weight: number
  lastHealthCheck: string | null
  healthStatus: {
    status?: string
    responseTime?: number
    error?: string
    lastCheck?: string
  }
  lastUsedAt: string | null
  requestCount: number
  successCount: number
  errorCount: number
  createdAt: string
}

interface CreateAccountData {
  name: string
  type: 'ANTHROPIC_API' | 'CLAUDE_CODE' | 'GEMINI_CLI' | 'OPENAI_API'
  email?: string // 对于 ANTHROPIC_API 不需要
  credentials: {
    api_key?: string
    base_url?: string
    session_key?: string
    [key: string]: any
  }
  config?: {
    timeout?: number
    retry_count?: number
    [key: string]: any
  }
  priority?: number
  weight?: number
}

interface UpdateAccountData {
  name: string
  email?: string // 对于 ANTHROPIC_API 不需要
  credentials?: {
    api_key?: string
    base_url?: string
    session_key?: string
    [key: string]: any
  }
  config?: {
    timeout?: number
    retry_count?: number
    [key: string]: any
  }
  priority: number
  weight: number
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING'
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

  // 获取上游账号列表
  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem('token')
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
      const token = localStorage.getItem('token')
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
      const token = localStorage.getItem('token')
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
      const token = localStorage.getItem('token')
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
      const token = localStorage.getItem('token')
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
          <p className="text-sm text-zinc-600 mt-1">管理Claude Code、Anthropic API等上游服务账号</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4" />
          <span>添加账号</span>
        </button>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center space-x-4">
        <span className="text-sm font-medium text-zinc-700">类型筛选:</span>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-1 border border-zinc-200 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
        >
          <option value="all">全部</option>
          <option value="ANTHROPIC_API">Anthropic API</option>
          <option value="CLAUDE_CODE">Claude Code</option>
          <option value="GEMINI_CLI">Gemini CLI</option>
          <option value="OPENAI_API">OpenAI API</option>
        </select>
      </div>

      {/* 账号统计 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                  账号信息
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
                  <tr key={account.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{account.name}</div>
                        <div className="text-xs text-zinc-500">{account.email || '无邮箱'}</div>
                        <div className="text-xs text-zinc-400 mt-1">
                          创建于 {new Date(account.createdAt).toLocaleDateString()}
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
                        <div>优先级: {account.priority}</div>
                        <div className="text-xs text-zinc-500">权重: {account.weight}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <HealthStatus healthStatus={account.healthStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-zinc-900">
                        <div>{account.requestCount.toLocaleString()} 请求</div>
                        <div className="text-xs text-zinc-500">
                          成功: {account.successCount} / 失败: {account.errorCount}
                        </div>
                        <div className="text-xs text-zinc-400">
                          {account.lastUsedAt 
                            ? `最后使用: ${new Date(account.lastUsedAt).toLocaleDateString()}`
                            : '从未使用'
                          }
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => performHealthCheck(account.id)}
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
                          onClick={() => deleteAccount(account.id)}
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
          onSubmit={(accountData) => updateAccount(editingAccount.id, accountData)}
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
    ANTHROPIC_API: { color: 'bg-purple-100 text-purple-700', text: 'Anthropic' },
    CLAUDE_CODE: { color: 'bg-blue-100 text-blue-700', text: 'Claude Code' },
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
                onChange={(e) => setFormData({ ...formData, type: e.target.value as CreateAccountData['type'] })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              >
                <option value="ANTHROPIC_API">Anthropic API</option>
                <option value="CLAUDE_CODE">Claude Code</option>
                <option value="GEMINI_CLI">Gemini CLI</option>
                <option value="OPENAI_API">OpenAI API</option>
              </select>
            </div>
          </div>

          {formData.type !== 'ANTHROPIC_API' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                邮箱地址
              </label>
              <input
                type="email"
                required
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                placeholder="account@example.com"
              />
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
    email: account.type !== 'ANTHROPIC_API' ? (account.email || '') : undefined,
    priority: account.priority,
    weight: account.weight,
    status: account.status
  })

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

          {account.type !== 'ANTHROPIC_API' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                邮箱地址
              </label>
              <input
                type="email"
                required
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
            </div>
          )}

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

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              状态
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as UpdateAccountData['status'] })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="ACTIVE">活跃</option>
              <option value="INACTIVE">停用</option>
              <option value="ERROR">错误</option>
              <option value="PENDING">待验证</option>
            </select>
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