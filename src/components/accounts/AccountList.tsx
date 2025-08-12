'use client'

import { Server, AlertCircle, CheckCircle, Edit, Trash2, Play, Pause, RefreshCw, Power, PowerOff } from 'lucide-react'
import { UpstreamAccount } from '@/types/accounts'

interface AccountListProps {
  accounts: UpstreamAccount[]
  isLoading: boolean
  onEdit: (account: UpstreamAccount) => void
  onDelete: (account: UpstreamAccount) => void
  onToggle: (id: number, isActive: boolean) => void
  onForceHealthCheck: (id: number) => void
}

// 提供商类型映射
const providerTypeMap: Record<string, { color: string; text: string }> = {
  anthropic_api: { color: 'bg-orange-100 text-orange-700', text: 'Anthropic API' },
  anthropic_oauth: { color: 'bg-blue-100 text-blue-700', text: 'Anthropic OAuth' },
  ANTHROPIC_API: { color: 'bg-orange-100 text-orange-700', text: 'Anthropic API' },
  ANTHROPIC_OAUTH: { color: 'bg-blue-100 text-blue-700', text: 'Anthropic OAuth' },
}

// 状态映射
const statusMap: Record<string, { color: string; text: string; icon: any }> = {
  healthy: { color: 'text-green-600', text: '健康', icon: CheckCircle },
  unhealthy: { color: 'text-red-600', text: '异常', icon: AlertCircle },
  unknown: { color: 'text-gray-600', text: '未知', icon: Server },
}

export function AccountList({ 
  accounts, 
  isLoading, 
  onEdit, 
  onDelete, 
  onToggle, 
  onForceHealthCheck 
}: AccountListProps) {
  console.log('🔍 AccountList 收到的数据:', { accounts, count: accounts.length, firstAccount: accounts[0] })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-12">
        <Server className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
        <h3 className="text-sm font-medium text-zinc-900 mb-2">暂无上游账号</h3>
        <p className="text-sm text-zinc-500">点击上方按钮添加第一个上游账号</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead className="bg-zinc-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
              账号信息
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
              类型
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
              状态
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
              统计
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-zinc-200">
          {accounts.map((account) => {
            const statusInfo = statusMap[account.status] || statusMap.unknown
            const providerInfo = providerTypeMap[account.provider] || { 
              color: 'bg-zinc-100 text-zinc-700', 
              text: account.provider 
            }
            const StatusIcon = statusInfo.icon

            return (
              <tr key={account.id} className="hover:bg-zinc-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`w-2 h-2 rounded-full mr-3 ${
                      account.isActive ? 'bg-green-400' : 'bg-zinc-300'
                    }`}></div>
                    <div>
                      <div className="text-sm font-medium text-zinc-900">
                        {account.name}
                      </div>
                      <div className="text-sm text-zinc-500">
                        ID: {account.id}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${providerInfo.color}`}>
                    {providerInfo.text}
                  </span>
                </td>

                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <StatusIcon className={`w-4 h-4 mr-2 ${statusInfo.color}`} />
                    <span className={`text-sm ${statusInfo.color}`}>
                      {statusInfo.text}
                    </span>
                  </div>
                  {account.lastHealthCheck && (
                    <div className="text-xs text-zinc-500 mt-1">
                      最近检查: {new Date(account.lastHealthCheck).toLocaleString()}
                    </div>
                  )}
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500">
                  <div>请求数: {account.requestCount}</div>
                  <div>成功率: {account.successRate.toFixed(1)}%</div>
                </td>

                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center gap-2">
                    {/* 启用/禁用切换 */}
                    <button
                      onClick={() => onToggle(account.id, !account.isActive)}
                      className={`p-1 rounded hover:bg-zinc-100 ${
                        account.isActive ? 'text-green-600' : 'text-zinc-400'
                      }`}
                      title={account.isActive ? '禁用账号' : '启用账号'}
                    >
                      {account.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </button>

                    {/* 强制健康检查 */}
                    <button
                      onClick={() => onForceHealthCheck(account.id)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="强制健康检查"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>

                    {/* 编辑 */}
                    <button
                      onClick={() => onEdit(account)}
                      className="p-1 text-zinc-600 hover:bg-zinc-100 rounded"
                      title="编辑账号"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    {/* 删除 */}
                    <button
                      onClick={() => onDelete(account)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="删除账号"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}