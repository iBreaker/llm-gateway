import { NextRequest, NextResponse } from 'next/server'
import { withApiKey, ApiKeyAuthRequest, recordUsage } from '@/lib/auth/api-key'
import { AnthropicClient, validateAnthropicRequest } from '@/lib/anthropic/client'
import { AnthropicOAuthClient } from '@/lib/anthropic-oauth/client'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/prisma'
import { loadBalancer } from '@/lib/load-balancer'
import { createStreamResponse, StreamController, StreamResourceManager, StreamTextProcessor } from '@/lib/utils/stream-handler'
import { secureLog } from '@/lib/utils/secure-logger'
import { InputValidator, validate, sanitize } from '@/lib/utils/input-validator'
import { performanceMonitor } from '@/lib/monitoring/performanceMonitor'

// 强制动态渲染
export const dynamic = 'force-dynamic'

async function handleAnthropicMessages(request: ApiKeyAuthRequest) {
  const requestId = nanoid()
  const startTime = Date.now()
  let upstreamAccount: any = null
  let requestBody: any = null

  // 开始性能监控
  performanceMonitor.startRequest(requestId, '/v1/messages', request.method, {
    userAgent: request.headers.get('user-agent') || undefined,
    clientIP: getClientIP(request),
    apiKeyId: request.apiKey?.id?.toString()
  })
  
  try {
    // 检查权限
    if (!request.apiKey || !request.apiKey.permissions.includes('anthropic.messages')) {
      return NextResponse.json(
        { error: 'insufficient_permissions', message: '权限不足：需要anthropic.messages权限' },
        { status: 403 }
      )
    }

    // 解析请求体
    requestBody = await request.json()
    
    // 安全验证用户输入
    if (requestBody.messages && Array.isArray(requestBody.messages)) {
      requestBody.messages = requestBody.messages.map((msg: any) => ({
        ...msg,
        content: typeof msg.content === 'string' ? sanitize(msg.content) : msg.content
      }))
    }
    
    if (requestBody.system && typeof requestBody.system === 'string') {
      requestBody.system = sanitize(requestBody.system)
    }
    
    // 验证请求格式
    const validation = validateAnthropicRequest(requestBody)
    if (!validation.valid) {
      secureLog.security('无效的API请求格式', 'medium', {
        requestId,
        validationError: validation.error,
        apiKeyId: request.apiKey?.id
      })
      return NextResponse.json(
        { error: 'invalid_request', message: validation.error },
        { status: 400 }
      )
    }

    // 使用负载均衡器选择最优的上游账号（所有类型）
    upstreamAccount = await loadBalancer.selectAccount(
      request.apiKey.userId, 
      'ALL'
    )
    if (!upstreamAccount) {
      await recordUsage(request.apiKey.id, null, {
        requestId,
        method: request.method,
        endpoint: '/v1/messages',
        model: requestBody.model,  // 添加模型信息
        statusCode: 503,
        responseTime: Date.now() - startTime,
        errorMessage: '无可用的上游账号',
        userAgent: request.headers.get('user-agent') || undefined,
        clientIp: getClientIP(request)
      })

      return NextResponse.json(
        { error: 'service_unavailable', message: '服务暂时不可用：无可用的上游账号' },
        { status: 503 }
      )
    }

    // 获取账号凭据
    const credentials = typeof upstreamAccount.credentials === 'object' 
      ? upstreamAccount.credentials 
      : JSON.parse(upstreamAccount.credentials as string)

    // 检查是否为流式请求
    const isStream = requestBody.stream === true

    if (isStream) {
      // 流式响应处理，带故障转移机制
      return handleStreamRequestWithFailover(requestBody, credentials, upstreamAccount, request, requestId, startTime)
    } else {
      // 非流式响应处理
      return handleNonStreamRequest(requestBody, credentials, upstreamAccount, request, requestId, startTime)
    }

  } catch (error: any) {
    const responseTime = Date.now() - startTime
    
    // 结束性能监控（错误情况）
    performanceMonitor.endRequest(requestId, 500, {
      upstreamAccountId: upstreamAccount?.id?.toString(),
      model: requestBody?.model,
      error: error.message
    })
    
    secureLog.error('Anthropic API请求失败', error, {
      requestId,
      endpoint: '/v1/messages',
      upstreamAccountId: upstreamAccount?.id,
      apiKeyId: request.apiKey?.id,
      model: requestBody?.model
    })

    // 如果已选择了上游账号，更新其错误统计
    if (upstreamAccount) {
      await loadBalancer.updateAccountUsage(upstreamAccount.id, false, responseTime)
    }

    // 记录错误
    await recordUsage(request.apiKey?.id || BigInt(0), upstreamAccount?.id || null, {
      requestId,
      method: request.method,
      endpoint: '/v1/messages',
      model: requestBody?.model,  // 添加模型信息
      statusCode: 500,
      responseTime,
      errorMessage: error.message,
      userAgent: request.headers.get('user-agent') || undefined,
      clientIp: getClientIP(request)
    })

    // 根据错误类型返回不同的状态码
    if (error.message.includes('API错误')) {
      return NextResponse.json(
        { error: 'upstream_error', message: error.message },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { error: 'internal_error', message: '服务器内部错误' },
      { status: 500 }
    )
  }
}


/**
 * 处理非流式请求
 */
async function handleNonStreamRequest(
  requestBody: any,
  credentials: any,
  upstreamAccount: any,
  request: ApiKeyAuthRequest,
  requestId: string,
  startTime: number
) {
  let anthropicResponse: any
  let cost: number = 0

  if (upstreamAccount.type === 'ANTHROPIC_OAUTH') {
    // 使用Claude Code OAuth token进行请求 - 参考relay项目的实现
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.accessToken}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
        // Claude Code特定headers - 来自relay项目
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
      },
      body: JSON.stringify({
        model: requestBody.model,
        max_tokens: requestBody.max_tokens,
        messages: requestBody.messages,
        temperature: requestBody.temperature,
        top_p: requestBody.top_p,
        top_k: requestBody.top_k,
        stream: false,
        stop_sequences: requestBody.stop_sequences,
        system: requestBody.system
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      secureLog.security('Claude Code API错误', 'medium', {
        status: response.status,
        endpoint: 'https://api.anthropic.com/v1/messages',
        requestId
      })
      throw new Error(`Claude Code API错误: ${response.status} - ${sanitize(errorText)}`)
    }

    anthropicResponse = await response.json()
    
    // 为Claude Code计算成本（使用标准定价）
    const inputTokens = anthropicResponse.usage?.input_tokens || 0
    const outputTokens = anthropicResponse.usage?.output_tokens || 0
    cost = calculateTokenCost(requestBody.model, inputTokens, outputTokens)
    
  } else {
    // 使用Anthropic API
    const anthropicClient = new AnthropicClient(credentials.api_key, credentials.base_url)

    anthropicResponse = await anthropicClient.createMessage({
      model: requestBody.model,
      max_tokens: requestBody.max_tokens,
      messages: requestBody.messages,
      temperature: requestBody.temperature,
      top_p: requestBody.top_p,
      top_k: requestBody.top_k,
      stream: false,
      stop_sequences: requestBody.stop_sequences,
      system: requestBody.system
    })

    cost = anthropicClient.calculateCost(requestBody.model, 
      anthropicResponse.usage?.input_tokens || 0,
      anthropicResponse.usage?.output_tokens || 0
    )
  }

  const responseTime = Date.now() - startTime
  const inputTokens = anthropicResponse.usage?.input_tokens || 0
  const outputTokens = anthropicResponse.usage?.output_tokens || 0
  const cacheCreationInputTokens = anthropicResponse.usage?.cache_creation_input_tokens || 0
  const cacheReadInputTokens = anthropicResponse.usage?.cache_read_input_tokens || 0

  // 记录使用统计
  await recordUsage(request.apiKey!.id, upstreamAccount.id, {
    requestId,
    method: request.method,
    endpoint: '/v1/messages',
    model: requestBody.model,
    statusCode: 200,
    responseTime,
    // 详细 token 信息
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    cost,
    userAgent: request.headers.get('user-agent') || undefined,
    clientIp: getClientIP(request)
  })

  // 使用负载均衡器更新账号使用统计
  await loadBalancer.updateAccountUsage(upstreamAccount.id, true, responseTime)

  // 结束性能监控（成功情况）
  performanceMonitor.endRequest(requestId, 200, {
    upstreamAccountId: upstreamAccount.id?.toString(),
    model: requestBody.model,
    inputTokens,
    outputTokens,
    cost
  })

  return NextResponse.json(anthropicResponse)
}

/**
 * 简单的token成本计算（用于Claude Code）
 */
function calculateTokenCost(model: string, inputTokens: number, outputTokens: number): number {
  // 基于模型的简单定价（美元）
  const pricing: Record<string, { input: number, output: number }> = {
    'claude-3-5-sonnet-20241022': { input: 3 / 1000000, output: 15 / 1000000 },
    'claude-3-5-haiku-20241022': { input: 1 / 1000000, output: 5 / 1000000 },
    'claude-3-opus-20240229': { input: 15 / 1000000, output: 75 / 1000000 }
  }
  
  const modelPricing = pricing[model] || pricing['claude-3-5-sonnet-20241022']
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output)
}

/**
 * 带故障转移的流式请求处理器
 */
async function handleStreamRequestWithFailover(
  requestBody: any,
  credentials: any,
  upstreamAccount: any,
  request: ApiKeyAuthRequest,
  requestId: string,
  startTime: number
): Promise<Response> {
  try {
    // 尝试使用当前账号
    return await handleStreamRequest(requestBody, credentials, upstreamAccount, request, requestId, startTime, false)
  } catch (error: any) {
    // 检查是否是认证错误
    if (error.message.includes('认证失败') && request.apiKey) {
      console.log(`账号 ${upstreamAccount.id} 认证失败，尝试故障转移...`)
      
      const alternativeAccount = await loadBalancer.markAccountFailedAndSelectAlternative(
        upstreamAccount.id,
        request.apiKey.userId,
        'ALL'
      )
      
      if (alternativeAccount) {
        console.log(`故障转移到账号 ${alternativeAccount.id}，重新发起请求`)
        const newCredentials = typeof alternativeAccount.credentials === 'object' 
          ? alternativeAccount.credentials 
          : JSON.parse(alternativeAccount.credentials as string)
        
        // 使用新账号重新尝试，标记为故障转移尝试
        return await handleStreamRequest(requestBody, newCredentials, alternativeAccount, request, requestId, startTime, true)
      }
    }
    
    // 如果没有可用的故障转移账号或不是认证错误，重新抛出原错误
    throw error
  }
}

/**
 * 处理流式请求
 */
async function handleStreamRequest(
  requestBody: any,
  credentials: any,
  upstreamAccount: any,
  request: ApiKeyAuthRequest,
  requestId: string,
  startTime: number,
  isFailoverAttempt: boolean = false
): Promise<Response> {
  let usageRecorded = false

  // 如果是故障转移的尝试，直接处理流式响应
  return createStreamResponse(async (stream: StreamController) => {
    const resources = new StreamResourceManager()
    const textProcessor = new StreamTextProcessor()

    try {
      // 根据账号类型构建请求
      let apiUrl: string
      let headers: Record<string, string>
      
      if (upstreamAccount.type === 'ANTHROPIC_OAUTH') {
        apiUrl = 'https://api.anthropic.com/v1/messages'
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${credentials.accessToken}`,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14',
          'accept': 'text/event-stream',
          'cache-control': 'no-cache',
          // Claude Code特定headers
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
      } else {
        apiUrl = `${credentials.base_url}/v1/messages`
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': credentials.api_key,
          'anthropic-version': '2023-06-01',
          'accept': 'text/event-stream',
          'cache-control': 'no-cache'
        }
      }
      
      // 发送流式请求到上游服务
      const upstreamResponse = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...requestBody,
          stream: true
        })
      })

      if (!upstreamResponse.ok) {
        const errorText = await upstreamResponse.text()
        secureLog.error('上游流式请求失败', undefined, {
          status: upstreamResponse.status,
          endpoint: apiUrl,
          requestId,
          error: sanitize(errorText)
        })

        // 如果是401认证错误，标记账号失败并抛出错误
        if (upstreamResponse.status === 401) {
          if (!isFailoverAttempt && request.apiKey) {
            console.log(`账号 ${upstreamAccount.id} 认证失败，标记为错误状态`)
            // 异步标记账号失败，不等待完成
            loadBalancer.markAccountFailedAndSelectAlternative(
              upstreamAccount.id,
              request.apiKey.userId,
              'ALL'
            ).catch(error => {
              console.error('标记账号失败时出错:', error)
            })
          }
          throw new Error(`认证失败: OAuth token expired or invalid`)
        }

        throw new Error(`上游服务错误: ${upstreamResponse.status}`)
      }

      const reader = upstreamResponse.body?.getReader()
      if (!reader) {
        throw new Error('无法获取响应流')
      }

      // 添加reader到资源管理器
      resources.addResource(() => reader.releaseLock())

      let buffer = ''
      let finalUsageData: any = null

      // 处理流数据
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }

        // 解码chunk并处理
        const chunk = new TextDecoder().decode(value)
        buffer += chunk

        // 处理完整的SSE行
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留最后的不完整行

        for (const line of lines) {
          // 转发SSE数据到客户端
          if (!stream.enqueue(line + '\n')) {
            // 流已关闭，停止处理
            return
          }

          // 解析使用统计数据
          if (line.startsWith('data: ') && line.length > 6) {
            try {
              const jsonStr = line.slice(6)
              if (jsonStr.trim() === '[DONE]') continue
              
              const data = JSON.parse(jsonStr)
              
              // 收集使用统计
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
                  
                  // 记录完整的使用统计
                  if (!usageRecorded) {
                    const responseTime = Date.now() - startTime
                    
                    const anthropicClient = new AnthropicClient(credentials.api_key, credentials.base_url)
                    const cost = anthropicClient.calculateCost(
                      finalUsageData.model || requestBody.model,
                      finalUsageData.input_tokens || 0,
                      finalUsageData.output_tokens || 0
                    )

                    // 异步记录使用统计
                    recordUsage(request.apiKey!.id, upstreamAccount.id, {
                      requestId,
                      method: request.method,
                      endpoint: '/v1/messages',
                      model: finalUsageData.model || requestBody.model,
                      statusCode: 200,
                      responseTime,
                      // 详细 token 信息
                      inputTokens: finalUsageData.input_tokens || 0,
                      outputTokens: finalUsageData.output_tokens || 0,
                      cacheCreationInputTokens: finalUsageData.cache_creation_input_tokens || 0,
                      cacheReadInputTokens: finalUsageData.cache_read_input_tokens || 0,
                      cost,
                      userAgent: request.headers.get('user-agent') || undefined,
                      clientIp: getClientIP(request)
                    }).catch(error => {
                      secureLog.error('记录使用统计失败', error, { requestId })
                    })

                    // 更新账号使用统计
                    loadBalancer.updateAccountUsage(upstreamAccount.id, true, responseTime).catch(error => {
                      secureLog.error('更新账号统计失败', error, { requestId, accountId: upstreamAccount.id })
                    })

                    usageRecorded = true
                  }
                }
              }
            } catch (parseError) {
              // 忽略JSON解析错误，继续处理
            }
          }
        }
      }

      // 处理剩余的buffer
      if (buffer.trim()) {
        stream.enqueue(buffer)
      }

    } catch (error) {
      secureLog.error('流式处理错误', error as Error, {
        requestId,
        upstreamAccountId: upstreamAccount.id,
        endpoint: '/v1/messages'
      })
      throw error
    } finally {
      resources.cleanup()
    }
  })
}

/**
 * 获取客户端IP地址（安全版本）
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const remoteAddress = request.headers.get('x-remote-address')
  const cfIP = request.headers.get('cf-connecting-ip')
  
  let clientIP = 'unknown'
  
  if (forwarded) {
    clientIP = forwarded.split(',')[0].trim()
  } else if (cfIP) {
    clientIP = cfIP.trim()
  } else if (realIP) {
    clientIP = realIP.trim()
  } else if (remoteAddress) {
    clientIP = remoteAddress.trim()
  }
  
  // 验证IP格式
  if (clientIP !== 'unknown' && !InputValidator.validateIP(clientIP)) {
    secureLog.security('无效的客户端IP格式', 'low', { 
      invalidIP: sanitize(clientIP),
      userAgent: request.headers.get('user-agent')
    })
    return 'invalid'
  }
  
  return clientIP
}

export const POST = withApiKey(handleAnthropicMessages as any, { 
  requiredPermission: 'anthropic.messages' 
})