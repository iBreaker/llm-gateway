// 上游 LLM Gateway 账号验证器
import type { LLMGatewayAccount, AccountValidator } from '@/lib/types/account-types'

export class LLMGatewayValidator implements AccountValidator {
  async validateCredentials(account: LLMGatewayAccount): Promise<boolean> {
    try {
      const { base_url, api_key } = account.credentials
      
      // 调用上游 LLM Gateway 的健康检查接口
      const response = await fetch(`${base_url}/api/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000) // 10秒超时
      })

      return response.ok
    } catch (error) {
      console.error('LLM Gateway 凭证验证失败:', error)
      return false
    }
  }

  async healthCheck(account: LLMGatewayAccount): Promise<{ healthy: boolean; message?: string }> {
    try {
      const { base_url, api_key, timeout = 10000 } = account.credentials
      
      // 调用健康检查接口
      const response = await fetch(`${base_url}/api/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(timeout)
      })

      if (response.ok) {
        const data = await response.json()
        return { 
          healthy: true, 
          message: data.message || 'Gateway is healthy' 
        }
      } else {
        return { 
          healthy: false, 
          message: `HTTP ${response.status}: ${response.statusText}` 
        }
      }
    } catch (error) {
      return { 
        healthy: false, 
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }
    }
  }

  // LLM Gateway 特有的方法
  async getGatewayInfo(account: LLMGatewayAccount): Promise<any> {
    try {
      const { base_url, api_key } = account.credentials
      
      const response = await fetch(`${base_url}/api/info`, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('获取 LLM Gateway 信息失败:', error)
      throw error
    }
  }

  // 获取上游网关的统计信息
  async getGatewayStats(account: LLMGatewayAccount): Promise<any> {
    try {
      const { base_url, api_key } = account.credentials
      
      const response = await fetch(`${base_url}/api/dashboard/stats`, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('获取 LLM Gateway 统计信息失败:', error)
      throw error
    }
  }

  // 获取上游网关的账号列表
  async getUpstreamAccounts(account: LLMGatewayAccount): Promise<any[]> {
    try {
      const { base_url, api_key } = account.credentials
      
      const response = await fetch(`${base_url}/api/dashboard/accounts`, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data.accounts || []
    } catch (error) {
      console.error('获取上游 LLM Gateway 账号列表失败:', error)
      throw error
    }
  }

  // 测试连接延迟
  async testLatency(account: LLMGatewayAccount): Promise<number> {
    try {
      const { base_url, api_key } = account.credentials
      
      const startTime = Date.now()
      
      const response = await fetch(`${base_url}/api/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      })

      const endTime = Date.now()
      
      if (response.ok) {
        return endTime - startTime
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('LLM Gateway 延迟测试失败:', error)
      throw error
    }
  }

  // 验证 API Key 权限
  async validatePermissions(account: LLMGatewayAccount, requiredPermissions: string[]): Promise<boolean> {
    try {
      const { base_url, api_key } = account.credentials
      
      const response = await fetch(`${base_url}/api/auth/permissions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permissions: requiredPermissions }),
        signal: AbortSignal.timeout(10000)
      })

      if (response.ok) {
        const data = await response.json()
        return data.valid === true
      }

      return false
    } catch (error) {
      console.error('LLM Gateway 权限验证失败:', error)
      return false
    }
  }

  // 获取 API Key 信息
  async getApiKeyInfo(account: LLMGatewayAccount): Promise<any> {
    try {
      const { base_url, api_key } = account.credentials
      
      const response = await fetch(`${base_url}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('获取 API Key 信息失败:', error)
      throw error
    }
  }
}