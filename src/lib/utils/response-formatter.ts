/**
 * 统一的响应格式化工具
 * 标准化API响应格式和数据转换
 */

import { formatEntityWithId, formatEntitiesWithIds, toStringId } from './id-converter'

/**
 * 标准分页响应格式
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasNext: boolean
}

/**
 * 标准API响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: {
    code: string
    message: string
    details?: any
  }
}

/**
 * 用户信息标准格式
 */
export interface UserResponse {
  id: string
  email: string
  username: string
  role: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * API密钥信息标准格式
 */
export interface ApiKeyResponse {
  id: string
  userId: string
  name: string
  permissions: string[]
  rateLimit?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  lastUsedAt?: string | null
}

/**
 * 上游账号信息标准格式
 */
export interface AccountResponse {
  id: string
  userId: string
  name: string
  type: string
  status: string
  description?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  lastHealthCheck?: string | null
  healthStatus?: string | null
}

/**
 * 使用记录标准格式
 */
export interface UsageRecordResponse {
  id: string
  requestId: string
  method: string
  endpoint: string
  model?: string | null
  statusCode?: number | null
  responseTime?: number | null
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  cost?: number | null
  errorMessage?: string | null
  apiKeyName?: string
  upstreamAccountName?: string
  upstreamAccountType?: string
  createdAt: string
}

/**
 * 格式化用户数据
 */
export function formatUser(user: any): UserResponse {
  return {
    id: toStringId(user.id),
    email: user.email,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

/**
 * 格式化API密钥数据
 */
export function formatApiKey(apiKey: any, includeKey: boolean = false): ApiKeyResponse & { key?: string } {
  const formatted: ApiKeyResponse & { key?: string } = {
    id: toStringId(apiKey.id),
    userId: toStringId(apiKey.userId),
    name: apiKey.name,
    permissions: apiKey.permissions,
    rateLimit: apiKey.rateLimit,
    isActive: apiKey.isActive,
    createdAt: apiKey.createdAt.toISOString(),
    updatedAt: apiKey.updatedAt.toISOString(),
    lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
  }

  if (includeKey && apiKey.key) {
    formatted.key = apiKey.key
  }

  return formatted
}

/**
 * 格式化上游账号数据
 */
export function formatAccount(account: any): AccountResponse {
  return {
    id: toStringId(account.id),
    userId: toStringId(account.userId),
    name: account.name,
    type: account.type,
    status: account.status,
    description: account.description,
    isActive: account.isActive,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    lastHealthCheck: account.lastHealthCheck ? account.lastHealthCheck.toISOString() : null,
    healthStatus: account.healthStatus,
  }
}

/**
 * 格式化使用记录数据
 */
export function formatUsageRecord(record: any): UsageRecordResponse {
  return {
    id: toStringId(record.id),
    requestId: record.requestId,
    method: record.method,
    endpoint: record.endpoint,
    model: record.model,
    statusCode: record.statusCode,
    responseTime: record.responseTime,
    inputTokens: Number(record.inputTokens || 0),
    outputTokens: Number(record.outputTokens || 0),
    cacheCreationInputTokens: Number(record.cacheCreationInputTokens || 0),
    cacheReadInputTokens: Number(record.cacheReadInputTokens || 0),
    cost: record.cost,
    errorMessage: record.errorMessage,
    apiKeyName: record.apiKey?.name,
    upstreamAccountName: record.upstreamAccount?.name,
    upstreamAccountType: record.upstreamAccount?.type,
    createdAt: record.createdAt.toISOString(),
  }
}

/**
 * 格式化分页响应
 */
export function formatPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  return {
    data,
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  }
}

/**
 * 格式化成功响应
 */
export function formatSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  }
}

/**
 * 格式化错误响应
 */
export function formatErrorResponse(
  code: string,
  message: string,
  details?: any
): ApiResponse {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  }
}

/**
 * 安全地转换BigInt字段到Number
 * 用于处理token计数等数值字段
 */
export function safeBigIntToNumber(value: bigint | null | undefined, defaultValue: number = 0): number {
  if (value === null || value === undefined) {
    return defaultValue
  }
  
  // 检查是否超出安全整数范围
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    console.warn(`BigInt value ${value} exceeds MAX_SAFE_INTEGER, may lose precision`)
  }
  
  return Number(value)
}

/**
 * 批量格式化用户数据
 */
export function formatUsers(users: any[]): UserResponse[] {
  return users.map(formatUser)
}

/**
 * 批量格式化API密钥数据
 */
export function formatApiKeys(apiKeys: any[], includeKey: boolean = false): (ApiKeyResponse & { key?: string })[] {
  return apiKeys.map(apiKey => formatApiKey(apiKey, includeKey))
}

/**
 * 批量格式化账号数据
 */
export function formatAccounts(accounts: any[]): AccountResponse[] {
  return accounts.map(formatAccount)
}

/**
 * 批量格式化使用记录数据
 */
export function formatUsageRecords(records: any[]): UsageRecordResponse[] {
  return records.map(formatUsageRecord)
}

/**
 * 日期字段格式化辅助函数
 */
export function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null
  
  if (typeof date === 'string') {
    return new Date(date).toISOString()
  }
  
  return date.toISOString()
}

/**
 * 处理可选的关联数据格式化
 */
export function formatOptionalRelation<T>(
  relation: T | null | undefined,
  formatter: (item: T) => any
): any | null {
  return relation ? formatter(relation) : null
}