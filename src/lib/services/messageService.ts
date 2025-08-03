/**
 * 消息处理业务服务
 * 分离API路由和业务逻辑，提供统一的消息处理接口
 */

import { nanoid } from 'nanoid'
import { AnthropicClient, validateAnthropicRequest } from '@/lib/anthropic/client'
import { AnthropicOAuthClient } from '@/lib/anthropic-oauth/client'
import { loadBalancer } from '@/lib/load-balancer'
import { recordUsage } from '@/lib/auth/api-key'
import { createStreamResponse, StreamController, StreamResourceManager } from '@/lib/utils/stream-handler'
import { secureLog } from '@/lib/utils/secure-logger'
import { InputValidator, sanitize } from '@/lib/utils/input-validator'
import { toBigInt } from '@/lib/utils/id-converter'
import type { ApiKeyAuthRequest } from '@/lib/auth/api-key'

export interface MessageRequest {
  messages: Array<{
    role: string
    content: string | any[]
  }>
  model: string
  max_tokens?: number
  temperature?: number
  top_p?: number
  stream?: boolean
  system?: string
  tools?: any[]
  tool_choice?: any
  metadata?: any
}

export interface MessageResponse {
  id: string
  type: string
  role: string
  content: any[]
  model: string
  stop_reason: string | null
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface MessageContext {
  requestId: string
  apiKey: NonNullable<ApiKeyAuthRequest['apiKey']>
  clientIP: string
  userAgent: string | null
  startTime: number
}

export interface StreamContext extends MessageContext {
  upstreamAccount: any
  credentials: any
}

export class MessageService {
  /**
   * 验证消息请求格式
   */
  static validateRequest(requestBody: any): { valid: boolean; error?: string } {
    // 基本格式验证
    const validation = validateAnthropicRequest(requestBody)
    if (!validation.valid) {
      return validation
    }

    // 安全性验证（简化版）
    if (!requestBody.messages || !Array.isArray(requestBody.messages)) {
      return { valid: false, error: '消息数组必需' }
    }
    if (!requestBody.model || typeof requestBody.model !== 'string') {
      return { valid: false, error: '模型参数必需' }
    }
    
    return { valid: true }
  }

  /**
   * 清理用户输入
   */
  static sanitizeRequest(requestBody: MessageRequest): MessageRequest {
    const sanitized = { ...requestBody }

    // 清理消息内容
    if (sanitized.messages && Array.isArray(sanitized.messages)) {
      sanitized.messages = sanitized.messages.map(msg => ({
        ...msg,
        content: typeof msg.content === 'string' ? sanitize(msg.content) : msg.content
      }))
    }

    // 清理系统提示
    if (sanitized.system && typeof sanitized.system === 'string') {
      sanitized.system = sanitize(sanitized.system)
    }

    return sanitized
  }

  /**
   * 选择最优上游账号
   */
  static async selectUpstreamAccount(
    userId: bigint,
    context: MessageContext
  ): Promise<any> {
    try {
      const account = await loadBalancer.selectAccount(
        userId,
        'ALL'
      )

      if (!account) {
        secureLog.warn('没有可用的上游账号', {
          requestId: context.requestId,
          userId: userId.toString(),
          apiKeyId: context.apiKey.id
        })
        throw new Error('没有可用的上游账号')
      }

      return account
    } catch (error) {
      secureLog.error('选择上游账号失败', error as Error, {
        requestId: context.requestId,
        userId: userId.toString()
      })
      throw error
    }
  }

  /**
   * 解密账号凭据
   */
  static async decryptCredentials(account: any, context: MessageContext): Promise<any> {
    try {
      let credentials: any

      if (account.type === 'ANTHROPIC_OAUTH') {
        credentials = JSON.parse(account.credentials as string)
        const oauthClient = new AnthropicOAuthClient({
          type: 'ANTHROPIC_OAUTH',
          accessToken: credentials.accessToken,
          refreshToken: credentials.refreshToken,
          expiresAt: credentials.expiresAt,
          scopes: credentials.scopes || []
        })
      } else {
        credentials = JSON.parse(account.credentials as string)
      }

      return credentials
    } catch (error) {
      secureLog.error('解密账号凭据失败', error as Error, {
        requestId: context.requestId,
        accountId: account.id,
        accountType: account.type
      })
      throw new Error('账号凭据解密失败')
    }
  }

  /**
   * 处理流式消息请求
   */
  static async handleStreamRequest(
    requestBody: MessageRequest,
    streamContext: StreamContext
  ): Promise<Response> {
    return createStreamResponse(async (stream: StreamController) => {
      const resources = new StreamResourceManager()
      let usageRecorded = false

      try {
        // 构建上游请求
        const { apiUrl, headers } = this.buildUpstreamRequest(
          streamContext.upstreamAccount,
          streamContext.credentials
        )

        // 发送流式请求
        const upstreamResponse = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...requestBody, stream: true })
        })

        if (!upstreamResponse.ok) {
          const errorText = await upstreamResponse.text()
          secureLog.error('上游流式请求失败', undefined, {
            status: upstreamResponse.status,
            endpoint: apiUrl,
            requestId: streamContext.requestId,
            error: sanitize(errorText)
          })
          throw new Error(`上游服务错误: ${upstreamResponse.status}`)
        }

        // 处理流式响应
        await this.processStreamResponse(
          upstreamResponse,
          stream,
          resources,
          streamContext,
          requestBody,
          (finalUsage) => {
            if (!usageRecorded) {
              this.recordStreamUsage(finalUsage, streamContext, requestBody)
              usageRecorded = true
            }
          }
        )

      } catch (error) {
        secureLog.error('流式处理错误', error as Error, {
          requestId: streamContext.requestId,
          upstreamAccountId: streamContext.upstreamAccount.id,
          endpoint: '/v1/messages'
        })
        throw error
      } finally {
        resources.cleanup()
      }
    })
  }

  /**
   * 处理非流式消息请求
   */
  static async handleNonStreamRequest(
    requestBody: MessageRequest,
    context: StreamContext
  ): Promise<MessageResponse> {
    const { apiUrl, headers } = this.buildUpstreamRequest(
      context.upstreamAccount,
      context.credentials
    )

    const upstreamResponse = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text()
      secureLog.error('上游非流式请求失败', undefined, {
        status: upstreamResponse.status,
        endpoint: apiUrl,
        requestId: context.requestId,
        error: sanitize(errorText)
      })
      throw new Error(`上游服务错误: ${upstreamResponse.status}`)
    }

    const responseData = await upstreamResponse.json()

    // 记录使用统计
    await this.recordNonStreamUsage(responseData, context, requestBody)

    return responseData
  }

  /**
   * 构建上游请求参数
   */
  private static buildUpstreamRequest(account: any, credentials: any): {
    apiUrl: string
    headers: Record<string, string>
  } {
    if (account.type === 'ANTHROPIC_OAUTH') {
      return {
        apiUrl: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
          'accept': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-stainless-retry-count': '0',
          'x-stainless-timeout': '60',
          'x-stainless-lang': 'js',
          'x-stainless-package-version': '0.55.1',
          'x-stainless-os': 'Windows',
          'x-stainless-arch': 'x64',
          'x-stainless-runtime': 'node',
          'x-stainless-runtime-version': 'v20.19.2',
          'anthropic-dangerous-direct-browser-access': 'true',
          'x-app': 'cli',
          'user-agent': 'claude-cli/1.0.57 (external, cli)',
          'accept-language': '*',
          'sec-fetch-mode': 'cors'
        }
      }
    } else {
      return {
        apiUrl: `${credentials.base_url}/v1/messages`,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': credentials.api_key,
          'anthropic-version': '2023-06-01',
          'accept': 'text/event-stream',
          'cache-control': 'no-cache'
        }
      }
    }
  }

  /**
   * 处理流式响应数据
   */
  private static async processStreamResponse(
    response: Response,
    stream: StreamController,
    resources: StreamResourceManager,
    context: StreamContext,
    requestBody: MessageRequest,
    onUsageComplete: (usage: any) => void
  ): Promise<void> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('无法获取响应流')
    }

    resources.addResource(() => reader.releaseLock())

    let buffer = ''
    let finalUsageData: any = null

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      const chunk = new TextDecoder().decode(value)
      buffer += chunk

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!stream.enqueue(line + '\n')) {
          return // 流已关闭
        }

        // 解析使用统计
        if (line.startsWith('data: ') && line.length > 6) {
          try {
            const jsonStr = line.slice(6)
            if (jsonStr.trim() === '[DONE]') continue
            
            const data = JSON.parse(jsonStr)
            
            if (data.type === 'message_start' && data.message?.usage) {
              finalUsageData = {
                input_tokens: data.message.usage.input_tokens || 0,
                cache_creation_input_tokens: data.message.usage.cache_creation_input_tokens || 0,
                cache_read_input_tokens: data.message.usage.cache_read_input_tokens || 0,
                model: data.message.model
              }
            }
            
            if (data.type === 'message_delta' && data.usage?.output_tokens !== undefined) {
              if (finalUsageData) {
                finalUsageData.output_tokens = data.usage.output_tokens || 0
                onUsageComplete(finalUsageData)
              }
            }
          } catch (parseError) {
            // 忽略JSON解析错误
          }
        }
      }
    }

    if (buffer.trim()) {
      stream.enqueue(buffer)
    }
  }

  /**
   * 记录流式请求使用统计
   */
  private static async recordStreamUsage(
    usageData: any,
    context: StreamContext,
    requestBody: MessageRequest
  ): Promise<void> {
    try {
      const responseTime = Date.now() - context.startTime
      
      const anthropicClient = new AnthropicClient(
        context.credentials.api_key || '',
        context.credentials.base_url || 'https://api.anthropic.com'
      )
      
      const cost = anthropicClient.calculateCost(
        usageData.model || requestBody.model,
        usageData.input_tokens || 0,
        usageData.output_tokens || 0
      )

      await recordUsage(toBigInt(context.apiKey.id), context.upstreamAccount.id, {
        requestId: context.requestId,
        method: 'POST',
        endpoint: '/v1/messages',
        model: usageData.model || requestBody.model,
        statusCode: 200,
        responseTime,
        inputTokens: usageData.input_tokens || 0,
        outputTokens: usageData.output_tokens || 0,
        cacheCreationInputTokens: usageData.cache_creation_input_tokens || 0,
        cacheReadInputTokens: usageData.cache_read_input_tokens || 0,
        cost,
        userAgent: context.userAgent || undefined,
        clientIp: context.clientIP
      })

      await loadBalancer.updateAccountUsage(context.upstreamAccount.id, true, responseTime)
    } catch (error) {
      secureLog.error('记录流式使用统计失败', error as Error, {
        requestId: context.requestId
      })
    }
  }

  /**
   * 记录非流式请求使用统计
   */
  private static async recordNonStreamUsage(
    responseData: MessageResponse,
    context: StreamContext,
    requestBody: MessageRequest
  ): Promise<void> {
    try {
      const responseTime = Date.now() - context.startTime
      
      const anthropicClient = new AnthropicClient(
        context.credentials.api_key || '',
        context.credentials.base_url || 'https://api.anthropic.com'
      )
      
      const cost = anthropicClient.calculateCost(
        responseData.model,
        responseData.usage.input_tokens,
        responseData.usage.output_tokens
      )

      await recordUsage(toBigInt(context.apiKey.id), context.upstreamAccount.id, {
        requestId: context.requestId,
        method: 'POST',
        endpoint: '/v1/messages',
        model: responseData.model,
        statusCode: 200,
        responseTime,
        inputTokens: responseData.usage.input_tokens,
        outputTokens: responseData.usage.output_tokens,
        cacheCreationInputTokens: responseData.usage.cache_creation_input_tokens || 0,
        cacheReadInputTokens: responseData.usage.cache_read_input_tokens || 0,
        cost,
        userAgent: context.userAgent || undefined,
        clientIp: context.clientIP
      })

      await loadBalancer.updateAccountUsage(context.upstreamAccount.id, true, responseTime)
    } catch (error) {
      secureLog.error('记录非流式使用统计失败', error as Error, {
        requestId: context.requestId
      })
    }
  }

  /**
   * 获取客户端IP地址
   */
  static getClientIP(request: Request): string {
    const headers = request.headers
    const forwarded = headers.get('x-forwarded-for')
    const realIP = headers.get('x-real-ip')
    const cfIP = headers.get('cf-connecting-ip')
    
    let clientIP = 'unknown'
    
    if (forwarded) {
      clientIP = forwarded.split(',')[0].trim()
    } else if (cfIP) {
      clientIP = cfIP.trim()
    } else if (realIP) {
      clientIP = realIP.trim()
    }
    
    // 验证IP格式
    if (clientIP !== 'unknown' && !InputValidator.validateIP(clientIP)) {
      secureLog.security('无效的客户端IP格式', 'low', { 
        invalidIP: sanitize(clientIP),
        userAgent: headers.get('user-agent')
      })
      return 'invalid'
    }
    
    return clientIP
  }

  /**
   * 生成请求ID
   */
  static generateRequestId(): string {
    return nanoid()
  }
}