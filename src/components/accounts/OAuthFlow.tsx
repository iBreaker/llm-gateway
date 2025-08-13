'use client'

import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { useOAuth } from '@/hooks/useOAuth'

interface OAuthFlowProps {
  onSuccess: () => void
  onClose: () => void
  proxyConfig?: {
    enabled: boolean
    proxyId: string | null
  }
}

export function OAuthFlow({ onSuccess, onClose, proxyConfig }: OAuthFlowProps) {
  const {
    oauthSession,
    isGeneratingAuth,
    isExchangingCode,
    showOAuthFlow,
    generateOAuthUrl,
    exchangeAuthorizationCode,
    copyAuthUrl
  } = useOAuth()

  const [authorizationInput, setAuthorizationInput] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)

  const handleGenerateAuth = async () => {
    try {
      await generateOAuthUrl()
    } catch (error: any) {
      alert(error.message || '生成授权链接失败')
    }
  }

  const handleExchangeCode = async () => {
    if (!authorizationInput.trim()) {
      alert('请输入授权码或回调URL')
      return
    }

    try {
      await exchangeAuthorizationCode(authorizationInput, proxyConfig)
      alert('Anthropic OAuth 账号添加成功！')
      onSuccess()
    } catch (error: any) {
      alert(error.message || '授权码交换失败')
    }
  }

  const handleCopyUrl = async () => {
    const success = await copyAuthUrl()
    if (success) {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-sm p-4">
        <h3 className="text-sm font-medium text-blue-900">Anthropic OAuth 授权</h3>
        <p className="text-xs text-blue-700 mt-1">
          点击下方按钮生成授权链接，通过官方 OAuth 方式安全添加 Anthropic 账号
        </p>
      </div>

      {!showOAuthFlow ? (
        <button
          type="button"
          onClick={handleGenerateAuth}
          disabled={isGeneratingAuth}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {isGeneratingAuth ? '生成中...' : '生成 OAuth 授权链接'}
        </button>
      ) : (
        <div className="space-y-4">
          {/* 授权链接显示区域 */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              授权链接
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                readOnly
                value={oauthSession?.authUrl || ''}
                className="flex-1 px-3 py-2 border border-zinc-300 rounded-sm text-sm bg-zinc-50"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-3 py-2 bg-zinc-100 border border-zinc-300 rounded-sm hover:bg-zinc-200 text-sm"
                title="复制链接"
              >
                <Copy className="w-4 h-4" />
              </button>
              <a
                href={oauthSession?.authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-blue-600 text-white rounded-sm hover:bg-blue-700 text-sm"
                title="在新窗口中打开"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            {copySuccess && (
              <p className="text-xs text-green-600 mt-1">✓ 链接已复制到剪贴板</p>
            )}
          </div>

          {/* 操作说明 */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-sm p-3">
            <p className="text-sm font-medium text-zinc-900 mb-2">操作步骤：</p>
            <ol className="text-xs text-zinc-600 space-y-1">
              {oauthSession?.instructions.map((instruction, index) => (
                <li key={index} className="flex items-start">
                  <span className="inline-block w-4 h-4 bg-blue-100 text-blue-600 rounded-full text-xs leading-4 text-center mr-2 mt-0.5 flex-shrink-0">
                    {index + 1}
                  </span>
                  {instruction}
                </li>
              ))}
            </ol>
          </div>

          {/* 授权码输入 */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              授权码或回调URL
            </label>
            <textarea
              value={authorizationInput}
              onChange={(e) => setAuthorizationInput(e.target.value)}
              placeholder="粘贴您从Anthropic获取的授权码或完整的回调URL..."
              rows={3}
              className="w-full px-3 py-2 border border-zinc-300 rounded-sm text-sm"
            />
          </div>

          {/* 提交按钮 */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExchangeCode}
              disabled={isExchangingCode || !authorizationInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExchangingCode ? '处理中...' : '完成授权'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}