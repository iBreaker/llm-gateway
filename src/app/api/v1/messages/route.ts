import { NextRequest, NextResponse } from 'next/server'
import { withApiKey, ApiKeyAuthRequest, recordUsage } from '@/lib/auth/api-key'
import { AnthropicClient, validateAnthropicRequest } from '@/lib/anthropic/client'
import { nanoid } from 'nanoid'
import { PrismaClient } from '@prisma/client'
import { loadBalancer } from '@/lib/load-balancer'

const prisma = new PrismaClient()

async function handleAnthropicMessages(request: ApiKeyAuthRequest) {
  const requestId = nanoid()
  const startTime = Date.now()
  let upstreamAccount: any = null
  let requestBody: any = null
  
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
    
    // 验证请求格式
    const validation = validateAnthropicRequest(requestBody)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'invalid_request', message: validation.error },
        { status: 400 }
      )
    }

    // 使用负载均衡器选择最优的上游账号
    upstreamAccount = await loadBalancer.selectAccount(
      request.apiKey.userId, 
      'ANTHROPIC_API'
    )
    if (!upstreamAccount) {
      await recordUsage(request.apiKey.id, null, {
        requestId,
        method: request.method,
        endpoint: '/v1/messages',
        model: requestBody.model,  // 添加模型信息
        statusCode: 503,
        responseTime: Date.now() - startTime,
        errorMessage: '无可用的Anthropic账号',
        userAgent: request.headers.get('user-agent') || undefined,
        clientIp: getClientIP(request)
      })

      return NextResponse.json(
        { error: 'service_unavailable', message: '服务暂时不可用：无可用的Anthropic账号' },
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
      // 流式响应处理
      return handleStreamRequest(requestBody, credentials, upstreamAccount, request, requestId, startTime)
    } else {
      // 非流式响应处理
      return handleNonStreamRequest(requestBody, credentials, upstreamAccount, request, requestId, startTime)
    }

  } catch (error: any) {
    const responseTime = Date.now() - startTime
    console.error('Anthropic API请求失败:', error)

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
  } finally {
    await prisma.$disconnect()
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
  // 创建Anthropic客户端
  const anthropicClient = new AnthropicClient(credentials.api_key, credentials.base_url)

  // 发送请求到Anthropic
  const anthropicResponse = await anthropicClient.createMessage({
    model: requestBody.model,
    max_tokens: requestBody.max_tokens,
    messages: requestBody.messages,
    temperature: requestBody.temperature,
    top_p: requestBody.top_p,
    top_k: requestBody.top_k,
    stream: false, // 确保非流式
    stop_sequences: requestBody.stop_sequences,
    system: requestBody.system
  })

  const responseTime = Date.now() - startTime
  const inputTokens = anthropicResponse.usage?.input_tokens || 0
  const outputTokens = anthropicResponse.usage?.output_tokens || 0
  const cacheCreationInputTokens = anthropicResponse.usage?.cache_creation_input_tokens || 0
  const cacheReadInputTokens = anthropicResponse.usage?.cache_read_input_tokens || 0
  const cost = anthropicClient.calculateCost(requestBody.model, inputTokens, outputTokens)

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

  return NextResponse.json(anthropicResponse)
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
  startTime: number
) {
  // 创建流式响应
  const encoder = new TextEncoder()
  let usageRecorded = false

  const stream = new ReadableStream({
    async start(controller) {
      let isControllerClosed = false
      
      // 安全关闭 controller 的辅助函数
      const safeClose = () => {
        if (!isControllerClosed) {
          try {
            controller.close()
            isControllerClosed = true
          } catch (e) {
            // 忽略重复关闭错误
          }
        }
      }

      // 安全报错的辅助函数
      const safeError = (error: Error) => {
        if (!isControllerClosed) {
          try {
            controller.error(error)
            isControllerClosed = true
          } catch (e) {
            // 忽略重复关闭错误
          }
        }
      }

      try {
        // 直接使用fetch进行流式请求到上游服务
        const upstreamResponse = await fetch(`${credentials.base_url}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': credentials.api_key,
            'anthropic-version': '2023-06-01',
            'accept': 'text/event-stream',
            'cache-control': 'no-cache'
          },
          body: JSON.stringify({
            ...requestBody,
            stream: true
          })
        })

        if (!upstreamResponse.ok) {
          const errorText = await upstreamResponse.text()
          console.error('上游流式请求失败:', upstreamResponse.status, errorText)
          safeError(new Error(`上游服务错误: ${upstreamResponse.status}`))
          return
        }

        const reader = upstreamResponse.body?.getReader()
        if (!reader) {
          safeError(new Error('无法获取响应流'))
          return
        }

        let buffer = ''
        let finalUsageData: any = null

        try {
          while (true) {
            const { done, value } = await reader.read()
            
            if (done) {
              break
            }

            // 检查 controller 是否已关闭
            if (isControllerClosed) {
              break
            }

            // 解码chunk并处理
            const chunk = new TextDecoder().decode(value)
            buffer += chunk

            // 处理完整的SSE行
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // 保留最后的不完整行

            for (const line of lines) {
              // 检查 controller 是否已关闭
              if (isControllerClosed) {
                break
              }

              // 转发SSE数据到客户端
              try {
                controller.enqueue(encoder.encode(line + '\n'))
              } catch (enqueueError) {
                // 如果 enqueue 失败，说明流已关闭
                isControllerClosed = true
                break
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
                          console.error('记录使用统计失败:', error)
                        })

                        // 更新账号使用统计
                        loadBalancer.updateAccountUsage(upstreamAccount.id, true, responseTime).catch(error => {
                          console.error('更新账号统计失败:', error)
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
          if (buffer.trim() && !isControllerClosed) {
            try {
              controller.enqueue(encoder.encode(buffer))
            } catch (enqueueError) {
              // 如果 enqueue 失败，说明流已关闭
              isControllerClosed = true
            }
          }

        } finally {
          reader.releaseLock()
        }

        // 正常结束，关闭流
        safeClose()

      } catch (error) {
        console.error('流式处理错误:', error)
        safeError(error as Error)
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    }
  })
}

/**
 * 获取客户端IP地址
 */
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const remoteAddress = request.headers.get('x-remote-address')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  return realIP || remoteAddress || 'unknown'
}

export const POST = withApiKey(handleAnthropicMessages as any, { 
  requiredPermission: 'anthropic.messages' 
})