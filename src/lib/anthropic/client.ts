import axios, { AxiosResponse } from 'axios'

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  temperature?: number
  top_p?: number
  top_k?: number
  stream?: boolean
  stop_sequences?: string[]
  system?: string
}

export interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{
    type: 'text'
    text: string
  }>
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence'
  stop_sequence?: string
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export interface AnthropicError {
  type: string
  error: {
    type: string
    message: string
  }
}

/**
 * Anthropic API客户端
 */
export class AnthropicClient {
  private apiKey: string
  private baseURL: string

  constructor(apiKey: string, baseURL?: string) {
    this.apiKey = apiKey
    this.baseURL = baseURL || 'https://api.anthropic.com'
  }

  /**
   * 发送消息到Claude
   */
  async createMessage(request: AnthropicRequest): Promise<AnthropicResponse> {
    try {
      const response: AxiosResponse<AnthropicResponse> = await axios.post(
        `${this.baseURL}/v1/messages`,
        {
          model: request.model,
          max_tokens: request.max_tokens,
          messages: request.messages,
          temperature: request.temperature,
          top_p: request.top_p,
          top_k: request.top_k,
          stream: request.stream || false,
          stop_sequences: request.stop_sequences,
          system: request.system
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          },
          timeout: 60000 // 60秒超时
        }
      )

      return response.data
    } catch (error: any) {
      if (error.response) {
        const anthropicError: AnthropicError = error.response.data
        throw new Error(`Anthropic API错误: ${anthropicError.error?.message || '未知错误'}`)
      } else if (error.request) {
        throw new Error('网络错误: 无法连接到Anthropic API')
      } else {
        throw new Error(`请求错误: ${error.message}`)
      }
    }
  }

  /**
   * 验证API Key是否有效
   */
  async validateApiKey(): Promise<{ valid: boolean, error?: string, details?: any }> {
    try {
      // 先检查长度
      if (this.apiKey.length < 20) {
        return { valid: false, error: 'API Key长度不足' }
      }

      console.log(`验证API Key: ${this.apiKey.substring(0, 10)}...`)
      console.log(`Base URL: ${this.baseURL}`)

      // 使用 fetch API 避免 axios 的请求头问题
      const response = await fetch(`${this.baseURL}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'test' }]
        }),
        // 30秒超时（如果环境支持的话）
        ...(typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? { signal: AbortSignal.timeout(30000) } : {})
      })
      
      console.log(`响应状态: ${response.status} ${response.statusText}`)
      
      if (response.ok) {
        return { valid: true }
      } else {
        const errorText = await response.text().catch(() => '无法读取错误响应')
        return { valid: false, error: `HTTP ${response.status}: ${response.statusText}`, details: errorText }
      }
      
    } catch (error: any) {
      // 详细错误分析
      const errorInfo = {
        name: error.name,
        message: error.message,
        code: error.code,
        cause: error.cause,
        stack: error.stack
      }
      
      console.log('错误详情:', JSON.stringify(errorInfo, null, 2))
      
      // 如果是 HTTP 协议错误但有响应数据，说明API Key可能是有效的
      if (error.name === 'TypeError' && error.message === 'fetch failed' && error.cause) {
        const cause = error.cause
        console.log('检测到网络错误，原因:', cause)
        
        // 检查是否是 Content-Length/Transfer-Encoding 冲突
        if (cause.code === 'HPE_UNEXPECTED_CONTENT_LENGTH' && cause.data) {
          console.log('检测到代理服务器响应头问题，但收到了有效响应数据')
          // 尝试解析响应数据来判断API Key是否有效
          try {
            const responseText = cause.data.toString()
            console.log('响应数据片段:', responseText.substring(0, 200))
            if (responseText.includes('"type":"message"') && responseText.includes('"role":"assistant"')) {
              console.log('响应包含有效的Claude消息，API Key应该是有效的')
              return { valid: true, error: '代理服务器响应头问题，但API Key有效' }
            }
          } catch (parseError) {
            console.error('解析响应数据失败:', parseError)
          }
        }
        
        // 只有在真正无法确定API Key有效性时才记录错误
        console.error('网络连接失败，无法验证API Key:', cause.code || error.message)
        return { 
          valid: false, 
          error: `网络连接失败: ${cause.code || error.message}`,
          details: cause
        }
      }
      
      // 如果是认证错误，说明API Key无效
      if (error?.status === 401) {
        console.error('API Key认证失败')
        return { valid: false, error: 'API Key认证失败' }
      }
      
      // 如果是其他错误（如模型不存在），可能是API Key有效但其他问题
      if (error?.status >= 400 && error?.status < 500) {
        const isValid = error?.status !== 401 && error?.status !== 403
        if (!isValid) {
          console.error('API Key无效或无权限')
        }
        return { 
          valid: isValid, 
          error: isValid ? `API Key有效但请求有误: HTTP ${error.status}` : 'API Key无效或无权限'
        }
      }
      
      // 未知错误
      console.error('API Key验证遇到未知错误:', error.message)
      return { 
        valid: false, 
        error: `未知错误: ${error.message}`,
        details: errorInfo
      }
    }
  }

  /**
   * 获取可用的模型列表
   */
  getAvailableModels(): string[] {
    return [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ]
  }

  /**
   * 计算请求成本（基于tokens）
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number, output: number }> = {
      'claude-sonnet-4-20250514': { input: 0.015, output: 0.075 },
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
    }

    const modelPricing = pricing[model] || pricing['claude-3-haiku-20240307']
    
    return (inputTokens / 1000) * modelPricing.input + (outputTokens / 1000) * modelPricing.output
  }
}

/**
 * 验证Anthropic请求格式
 */
export function validateAnthropicRequest(request: any): { valid: boolean, error?: string } {
  // 基本验证 - 与claude-relay-service保持一致
  if (!request || typeof request !== 'object') {
    return { valid: false, error: 'Invalid request' }
  }

  if (!request.messages || !Array.isArray(request.messages)) {
    return { valid: false, error: 'Missing or invalid field: messages (must be an array)' }
  }

  if (request.messages.length === 0) {
    return { valid: false, error: 'Messages array cannot be empty' }
  }

  // 简化验证 - 让上游API处理详细验证
  return { valid: true }
}