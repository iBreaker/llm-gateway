import { useState, useEffect } from 'react'
import { apiClient } from '@/utils/api'
import { UpstreamAccount, CreateAccountData, UpdateAccountData } from '@/types/accounts'

export function useAccounts() {
  const [accounts, setAccounts] = useState<UpstreamAccount[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadAccounts = async () => {
    try {
      setIsLoading(true)
      
      // 测试toCamelCase转换
      console.log('🔍 测试snake_case转换:')
      const testData = {
        account_type: 'ANTHROPIC_API',
        is_active: true,
        created_at: '2025-01-01',
        last_health_check: '2025-01-02',
        request_count: 100,
        success_rate: 95.5
      }
      console.log('原始数据:', testData)
      const { toCamelCase } = await import('@/utils/api')
      console.log('转换后:', toCamelCase(testData))
      
      const response = await apiClient.get<{accounts: UpstreamAccount[], total: number}>('/api/accounts')
      console.log('🔍 账号列表API响应:', response)
      console.log('🔍 accounts数组:', response.accounts)
      console.log('🔍 accounts数组长度:', response.accounts?.length)
      
      setAccounts(response.accounts || [])
    } catch (error) {
      console.error('❌ 获取账号列表失败:', error)
      setAccounts([]) // 出错时设置为空数组
    } finally {
      setIsLoading(false)
    }
  }

  const createAccount = async (data: CreateAccountData) => {
    const response = await apiClient.post<UpstreamAccount>('/api/accounts', data)
    await loadAccounts() // 刷新列表
    return response
  }

  const updateAccount = async (id: number, data: UpdateAccountData) => {
    const response = await apiClient.put<UpstreamAccount>(`/api/accounts/${id}`, data)
    await loadAccounts() // 刷新列表
    return response
  }

  const deleteAccount = async (id: number) => {
    await apiClient.delete(`/api/accounts/${id}`)
    await loadAccounts() // 刷新列表
  }

  const toggleAccount = async (id: number, isActive: boolean) => {
    await apiClient.put(`/api/accounts/${id}/toggle`, { is_active: isActive })
    await loadAccounts() // 刷新列表
  }

  const forceHealthCheck = async (id: number) => {
    await apiClient.post(`/api/accounts/${id}/health-check`)
    await loadAccounts() // 刷新列表
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  return {
    accounts,
    isLoading,
    loadAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleAccount,
    forceHealthCheck
  }
}