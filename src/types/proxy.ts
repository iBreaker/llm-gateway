// 代理配置相关类型定义

export interface ProxyConfig {
  id: string
  name: string
  proxyType: 'http' | 'socks5'
  host: string
  port: number
  enabled: boolean
  auth?: ProxyAuth
  extraConfig?: Record<string, string>
}

export interface ProxyAuth {
  username: string
  password: string
}

export interface SystemProxyConfig {
  proxies: Record<string, ProxyConfig>
  defaultProxyId?: string
  globalProxyEnabled: boolean
}

export interface CreateProxyRequest {
  name: string
  proxyType: 'http' | 'socks5'
  host: string
  port: number
  enabled: boolean
  auth?: ProxyAuth
}

export interface UpdateProxyRequest {
  name?: string
  proxyType?: 'http' | 'socks5'
  host?: string
  port?: number
  enabled?: boolean
  auth?: ProxyAuth
}