// API 配置
export const API_CONFIG = {
  // 生产模式直接连接Rust后端，开发模式使用Next.js代理
  baseURL: process.env.NODE_ENV === 'production' 
    ? (process.env.NEXT_PUBLIC_RUST_BACKEND_URL || 'http://localhost:9527')
    : '', // 开发模式使用相对路径，通过Next.js代理
  
  // API路径前缀
  prefix: '/api',
  
  // 健康检查路径
  healthPath: '/health',
  
  // 默认超时时间
  timeout: 30000,
  
  // 默认请求头
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
}

// 构建完整的API URL
export function buildApiUrl(path: string): string {
  const base = API_CONFIG.baseURL
  const fullPath = path.startsWith('/') ? path : `${API_CONFIG.prefix}/${path}`
  
  if (base) {
    return `${base}${fullPath}`
  }
  
  return fullPath
}

// 构建健康检查URL
export function buildHealthUrl(): string {
  const base = API_CONFIG.baseURL
  
  if (base) {
    return `${base}${API_CONFIG.healthPath}`
  }
  
  return API_CONFIG.healthPath
}

// API请求辅助函数
export async function apiRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const url = buildApiUrl(path)
  
  const defaultOptions: RequestInit = {
    headers: {
      ...API_CONFIG.defaultHeaders,
      ...options.headers,
    },
  }
  
  return fetch(url, { ...defaultOptions, ...options })
}