'use client'

import { useEffect, useState } from 'react'
import { Plus, MoreHorizontal, Search, Edit, Trash2, UserPlus, X } from 'lucide-react'

interface User {
  id: string
  email: string
  username: string
  role: string
  isActive: boolean
  createdAt: string
  lastLoginAt: string | null
}

interface CreateUserData {
  email: string
  username: string
  password: string
  role: string
}

interface UpdateUserData {
  email: string
  username: string
  role: string
  isActive: boolean
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      } else {
        setMessage({ type: 'error', text: '获取用户列表失败' })
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setIsLoading(false)
    }
  }

  const createUser = async (userData: CreateUserData) => {
    setIsCreating(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: '用户创建成功' })
        setShowCreateModal(false)
        fetchUsers()
      } else {
        setMessage({ type: 'error', text: data.message || '创建用户失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setIsCreating(false)
    }
  }

  const updateUser = async (userId: string, userData: UpdateUserData) => {
    setIsUpdating(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({ type: 'success', text: '用户更新成功' })
        setShowEditModal(false)
        setEditingUser(null)
        fetchUsers()
      } else {
        setMessage({ type: 'error', text: data.message || '更新用户失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    } finally {
      setIsUpdating(false)
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('确定要删除这个用户吗？此操作不可恢复。')) {
      return
    }

    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setMessage({ type: 'success', text: '用户删除成功' })
        fetchUsers()
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.message || '删除用户失败' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: '网络错误，请重试' })
    }
  }

  // 清除消息提示
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [message])

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.username.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          <h1 className="text-xl font-bold text-zinc-900">用户管理</h1>
          <p className="text-sm text-zinc-600">管理系统用户账号和权限</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-3 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加用户
        </button>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`p-3 rounded-sm text-sm ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-700 border border-green-200' 
            : 'bg-red-100 text-red-700 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* 搜索栏 */}
      <div className="bg-white border border-zinc-200 rounded-sm p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-4 h-4" />
          <input
            type="text"
            placeholder="搜索用户邮箱或用户名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
      </div>

      {/* 用户列表 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-zinc-600">
              {searchTerm ? '未找到匹配的用户' : '暂无用户'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    用户
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    角色
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    最后登录
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    注册时间
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{user.username}</p>
                        <p className="text-sm text-zinc-500">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge isActive={user.isActive} />
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {user.lastLoginAt 
                        ? new Date(user.lastLoginAt).toLocaleDateString()
                        : '从未登录'
                      }
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center space-x-2 justify-end">
                        <button 
                          onClick={() => {
                            setEditingUser(user)
                            setShowEditModal(true)
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-600"
                          title="编辑用户"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteUser(user.id)}
                          className="p-1 text-zinc-400 hover:text-red-600"
                          title="删除用户"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">总用户数</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">{users.length}</p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">活跃用户</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {users.filter(u => u.isActive).length}
          </p>
        </div>
        <div className="bg-white border border-zinc-200 rounded-sm p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">管理员</p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {users.filter(u => u.role === 'ADMIN').length}
          </p>
        </div>
      </div>

      {/* 创建用户模态框 */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={createUser}
          isLoading={isCreating}
        />
      )}

      {/* 编辑用户模态框 */}
      {showEditModal && editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => {
            setShowEditModal(false)
            setEditingUser(null)
          }}
          onSubmit={(userData) => updateUser(editingUser.id, userData)}
          isLoading={isUpdating}
        />
      )}
    </div>
  )
}

interface RoleBadgeProps {
  role: string
}

function RoleBadge({ role }: RoleBadgeProps) {
  const roleConfig = {
    ADMIN: { label: '管理员', className: 'bg-red-100 text-red-700' },
    USER: { label: '用户', className: 'bg-blue-100 text-blue-700' },
    READONLY: { label: '只读', className: 'bg-zinc-100 text-zinc-700' }
  }

  const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.USER

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-sm ${config.className}`}>
      {config.label}
    </span>
  )
}

interface StatusBadgeProps {
  isActive: boolean
}

function StatusBadge({ isActive }: StatusBadgeProps) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-sm ${
      isActive 
        ? 'bg-green-100 text-green-700' 
        : 'bg-zinc-100 text-zinc-700'
    }`}>
      {isActive ? '活跃' : '已禁用'}
    </span>
  )
}

interface CreateUserModalProps {
  onClose: () => void
  onSubmit: (userData: CreateUserData) => void
  isLoading: boolean
}

function CreateUserModal({ onClose, onSubmit, isLoading }: CreateUserModalProps) {
  const [formData, setFormData] = useState<CreateUserData>({
    email: '',
    username: '',
    password: '',
    role: 'USER'
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">添加用户</h2>
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
              邮箱
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              用户名
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              placeholder="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              密码
            </label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              placeholder="至少8位字符"
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              角色
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="USER">用户</option>
              <option value="ADMIN">管理员</option>
              <option value="READONLY">只读</option>
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
              {isLoading ? '创建中...' : '创建用户'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditUserModalProps {
  user: User
  onClose: () => void
  onSubmit: (userData: UpdateUserData) => void
  isLoading: boolean
}

function EditUserModal({ user, onClose, onSubmit, isLoading }: EditUserModalProps) {
  const [formData, setFormData] = useState<UpdateUserData & { password?: string }>({
    email: user.email,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    password: ''
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const submitData: any = {
      email: formData.email,
      username: formData.username,
      role: formData.role,
      isActive: formData.isActive
    }
    
    // 只在有新密码时才包含密码字段
    if (formData.password?.trim()) {
      submitData.password = formData.password
    }
    
    onSubmit(submitData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-sm border border-zinc-200 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">编辑用户</h2>
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
              邮箱
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              用户名
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              新密码 (留空不修改)
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
              placeholder="留空不修改密码"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              角色
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="USER">用户</option>
              <option value="ADMIN">管理员</option>
              <option value="READONLY">只读</option>
            </select>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm font-medium text-zinc-700">启用用户</span>
            </label>
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
              {isLoading ? '更新中...' : '更新用户'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}