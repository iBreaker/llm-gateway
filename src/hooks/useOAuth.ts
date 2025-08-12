import { useState } from 'react'
import { apiClient } from '@/utils/api'
import { OAuthSession, OAuthExchangeRequest } from '@/types/accounts'

export function useOAuth() {
  const [oauthSession, setOauthSession] = useState<OAuthSession | null>(null)
  const [isGeneratingAuth, setIsGeneratingAuth] = useState(false)
  const [isExchangingCode, setIsExchangingCode] = useState(false)
  const [showOAuthFlow, setShowOAuthFlow] = useState(false)

  const generateOAuthUrl = async () => {
    setIsGeneratingAuth(true)
    try {
      const response = await apiClient.post<{data: OAuthSession}>('/api/oauth/anthropic/generate-auth-url')
      
      console.log('🔍 OAuth URL 生成响应:', response)
      setOauthSession(response.data)
      setShowOAuthFlow(true)
      return response.data
    } catch (error: any) {
      console.error('❌ OAuth URL 生成失败:', error)
      throw error
    } finally {
      setIsGeneratingAuth(false)
    }
  }

  const exchangeAuthorizationCode = async (callbackUrl: string) => {
    if (!oauthSession) {
      throw new Error('未找到OAuth会话信息')
    }

    setIsExchangingCode(true)
    try {
      const response = await apiClient.post('/api/oauth/anthropic/exchange-code', {
        sessionId: oauthSession.sessionId,
        callbackUrl: callbackUrl.trim()
      })

      console.log('✅ OAuth 授权码交换成功:', response)
      return response
    } catch (error: any) {
      console.error('❌ OAuth 授权码交换失败:', error)
      throw error
    } finally {
      setIsExchangingCode(false)
    }
  }

  const copyAuthUrl = async () => {
    if (!oauthSession) return false

    try {
      await navigator.clipboard.writeText(oauthSession.authUrl)
      return true
    } catch (error) {
      // 降级方案：使用textarea
      const textArea = document.createElement('textarea')
      textArea.value = oauthSession.authUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      return true
    }
  }

  const resetOAuthFlow = () => {
    setOauthSession(null)
    setShowOAuthFlow(false)
    setIsGeneratingAuth(false)
    setIsExchangingCode(false)
  }

  return {
    oauthSession,
    isGeneratingAuth,
    isExchangingCode,
    showOAuthFlow,
    generateOAuthUrl,
    exchangeAuthorizationCode,
    copyAuthUrl,
    resetOAuthFlow
  }
}