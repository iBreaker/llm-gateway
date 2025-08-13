// 全局API工具类，处理前后端数据格式转换
// 前端使用camelCase，后端使用snake_case

/**
 * 将snake_case对象转换为camelCase对象
 */
function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(toCamelCase)
  }

  const camelObj: any = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
      camelObj[camelKey] = toCamelCase(obj[key])
    }
  }
  return camelObj
}

/**
 * 将camelCase对象转换为snake_case对象
 */
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase)
  }

  const snakeObj: any = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
      snakeObj[snakeKey] = toSnakeCase(obj[key])
    }
  }
  return snakeObj
}

/**
 * API请求包装器
 */
export class ApiClient {
  private baseUrl: string
  
  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  private getToken(): string | null {
    return localStorage.getItem('access_token')
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    }
    
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    
    return headers
  }

  /**
   * 发送API请求
   */
  async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    
    // 处理请求体：将camelCase转换为snake_case
    const processedOptions = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers
      }
    }

    if (options.body && typeof options.body === 'string') {
      try {
        const bodyObj = JSON.parse(options.body)
        const snakeCaseBody = toSnakeCase(bodyObj)
        processedOptions.body = JSON.stringify(snakeCaseBody)
      } catch {
        // 如果不是JSON，保持原样
      }
    }

    const response = await fetch(url, processedOptions)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    const data = await response.json()
    
    // 处理响应：将snake_case转换为camelCase
    const transformedData = toCamelCase(data)
    
    // 添加调试日志
    console.log('🔍 API响应原始数据:', data)
    console.log('🔍 API响应转换后数据:', transformedData)
    
    return transformedData
  }

  // 便捷方法
  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

// 创建默认的API客户端实例
export const apiClient = new ApiClient()

// 导出转换函数供特殊情况使用
export { toCamelCase, toSnakeCase }