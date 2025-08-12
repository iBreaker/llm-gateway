'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAccounts } from '@/hooks/useAccounts'
import { CreateAccountData, UpdateAccountData, UpstreamAccount } from '@/types/accounts'
import { AccountList } from '@/components/accounts/AccountList'
import { CreateAccountModal } from '@/components/accounts/CreateAccountModal'
import { EditAccountModal } from '@/components/accounts/EditAccountModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

export default function AccountsPage() {
  const {
    accounts,
    isLoading,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleAccount,
    forceHealthCheck
  } = useAccounts()

  // 模态框状态
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingAccount, setEditingAccount] = useState<UpstreamAccount | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState<UpstreamAccount | null>(null)

  // 操作状态
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  // 创建账号
  const handleCreateAccount = async (data: CreateAccountData) => {
    setIsCreating(true)
    try {
      await createAccount(data)
      setShowCreateModal(false)
    } catch (error: any) {
      alert(error.message || '创建账号失败')
    } finally {
      setIsCreating(false)
    }
  }

  // 编辑账号
  const handleEditAccount = (account: UpstreamAccount) => {
    setEditingAccount(account)
    setShowEditModal(true)
  }

  const handleUpdateAccount = async (id: number, data: UpdateAccountData) => {
    setIsUpdating(true)
    try {
      await updateAccount(id, data)
      setShowEditModal(false)
      setEditingAccount(null)
    } catch (error: any) {
      alert(error.message || '更新账号失败')
    } finally {
      setIsUpdating(false)
    }
  }

  // 删除账号
  const handleDeleteAccount = (account: UpstreamAccount) => {
    setDeletingAccount(account)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteAccount = async () => {
    if (!deletingAccount) return
    
    try {
      await deleteAccount(deletingAccount.id)
      setShowDeleteConfirm(false)
      setDeletingAccount(null)
    } catch (error: any) {
      alert(error.message || '删除账号失败')
    }
  }

  // 切换账号状态
  const handleToggleAccount = async (id: number, isActive: boolean) => {
    try {
      await toggleAccount(id, isActive)
    } catch (error: any) {
      alert(error.message || '切换账号状态失败')
    }
  }

  // 强制健康检查
  const handleForceHealthCheck = async (id: number) => {
    try {
      await forceHealthCheck(id)
    } catch (error: any) {
      alert(error.message || '健康检查失败')
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">上游账号管理</h1>
            <p className="text-sm text-zinc-600 mt-1">管理Anthropic OAuth、Anthropic API等上游服务账号</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-sm hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            添加上游账号
          </button>
        </div>
      </div>

      {/* 账号列表 */}
      <div className="bg-white border border-zinc-200 rounded-sm">
        <AccountList
          accounts={accounts}
          isLoading={isLoading}
          onEdit={handleEditAccount}
          onDelete={handleDeleteAccount}
          onToggle={handleToggleAccount}
          onForceHealthCheck={handleForceHealthCheck}
        />
      </div>

      {/* 创建账号模态框 */}
      {showCreateModal && (
        <CreateAccountModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateAccount}
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
          onSubmit={handleUpdateAccount}
          isLoading={isUpdating}
        />
      )}

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除账号"
        message={`确定要删除账号 "${deletingAccount?.name}" 吗？\n\n删除后将无法恢复，相关的使用记录也会被清除。`}
        confirmText="删除"
        cancelText="取消"
        isDangerous={true}
        onConfirm={confirmDeleteAccount}
        onCancel={() => {
          setShowDeleteConfirm(false)
          setDeletingAccount(null)
        }}
      />
    </div>
  )
}