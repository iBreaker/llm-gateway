import type { BaseRepository } from './base'
import type { DatabaseApiKey } from '../database'

/**
 * API 密钥数据创建接口
 */
export interface CreateApiKeyData {
  userId: number
  name: string
  keyHash: string
  permissions?: string[]
  isActive?: boolean
  expiresAt?: Date | null
  requestCount?: number
}

/**
 * API 密钥数据更新接口
 */
export interface UpdateApiKeyData {
  name?: string
  permissions?: string[]
  isActive?: boolean
  expiresAt?: Date | null
  lastUsedAt?: Date | null
  requestCount?: number
}

/**
 * API 密钥 Repository 接口
 * 定义 API 密钥相关的业务数据访问方法
 */
export interface ApiKeyRepository extends BaseRepository<DatabaseApiKey, CreateApiKeyData, UpdateApiKeyData> {
  /**
   * 根据密钥哈希查找 API 密钥
   */
  findByKeyHash(keyHash: string): Promise<DatabaseApiKey | null>

  /**
   * 根据用户 ID 查找 API 密钥列表
   */
  findByUserId(userId: number): Promise<DatabaseApiKey[]>

  /**
   * 查找活跃的 API 密钥
   */
  findActiveByKeyHash(keyHash: string): Promise<DatabaseApiKey | null>

  /**
   * 更新密钥使用时间和次数
   */
  updateUsage(id: number, lastUsedAt: Date, incrementCount?: boolean): Promise<void>

  /**
   * 查找即将过期的密钥
   */
  findExpiringKeys(days: number): Promise<DatabaseApiKey[]>

  /**
   * 禁用密钥
   */
  disable(id: number): Promise<boolean>

  /**
   * 启用密钥
   */
  enable(id: number): Promise<boolean>
}