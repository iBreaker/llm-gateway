import type { DatabaseAdapter } from '../../interfaces/database'
import type { DatabaseApiKey } from '../../interfaces/database'
import type { 
  ApiKeyRepository, 
  CreateApiKeyData, 
  UpdateApiKeyData,
  QueryOptions 
} from '../../interfaces/repositories'

/**
 * API 密钥 Repository 实现
 * 处理 API 密钥相关的业务数据访问逻辑
 */
export class ApiKeyRepositoryImpl implements ApiKeyRepository {
  constructor(private db: DatabaseAdapter) {}

  async findById(id: number): Promise<DatabaseApiKey | null> {
    return this.db.findOne<DatabaseApiKey>('api_keys', { id })
  }

  async findMany(where?: Record<string, any>, options?: QueryOptions): Promise<DatabaseApiKey[]> {
    return this.db.findMany<DatabaseApiKey>('api_keys', where, options)
  }

  async create(data: CreateApiKeyData): Promise<DatabaseApiKey> {
    return this.db.create<DatabaseApiKey>('api_keys', {
      user_id: data.userId,
      name: data.name,
      key_hash: data.keyHash,
      permissions: data.permissions || [],
      is_active: data.isActive ?? true,
      expires_at: data.expiresAt || null,
      request_count: data.requestCount || 0
    })
  }

  async update(id: number, data: UpdateApiKeyData): Promise<DatabaseApiKey | null> {
    const updateData: Record<string, any> = {}
    
    if (data.name !== undefined) updateData.name = data.name
    if (data.permissions !== undefined) updateData.permissions = data.permissions
    if (data.isActive !== undefined) updateData.is_active = data.isActive
    if (data.expiresAt !== undefined) updateData.expires_at = data.expiresAt
    if (data.lastUsedAt !== undefined) updateData.last_used_at = data.lastUsedAt
    if (data.requestCount !== undefined) updateData.request_count = data.requestCount

    if (Object.keys(updateData).length === 0) {
      return this.findById(id)
    }

    try {
      return await this.db.update<DatabaseApiKey>('api_keys', { id }, updateData)
    } catch {
      return null
    }
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete('api_keys', { id })
    return result > 0
  }

  async exists(id: number): Promise<boolean> {
    return this.db.exists('api_keys', { id })
  }

  async count(where?: Record<string, any>): Promise<number> {
    return this.db.count('api_keys', where)
  }

  // 业务特定方法
  async findByKeyHash(keyHash: string): Promise<DatabaseApiKey | null> {
    return this.db.findOne<DatabaseApiKey>('api_keys', { key_hash: keyHash })
  }

  async findByUserId(userId: number): Promise<DatabaseApiKey[]> {
    return this.db.findMany<DatabaseApiKey>('api_keys', { user_id: userId }, {
      orderBy: [{ field: 'created_at', direction: 'desc' }]
    })
  }

  async findActiveByKeyHash(keyHash: string): Promise<DatabaseApiKey | null> {
    return this.db.findOne<DatabaseApiKey>('api_keys', { 
      key_hash: keyHash, 
      is_active: true 
    })
  }

  async updateUsage(id: number, lastUsedAt: Date, incrementCount = true): Promise<void> {
    const updateData: Record<string, any> = {
      last_used_at: lastUsedAt
    }

    if (incrementCount) {
      // 这里需要使用原生 SQL 来实现计数器增量更新
      await this.db.raw(`
        UPDATE api_keys 
        SET last_used_at = $1, request_count = request_count + 1, updated_at = NOW()
        WHERE id = $2
      `, [lastUsedAt, id])
    } else {
      await this.db.update('api_keys', { id }, updateData)
    }
  }

  async findExpiringKeys(days: number): Promise<DatabaseApiKey[]> {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)

    return this.db.raw<DatabaseApiKey>(`
      SELECT * FROM api_keys 
      WHERE expires_at IS NOT NULL 
      AND expires_at <= $1 
      AND is_active = true
      ORDER BY expires_at ASC
    `, [futureDate])
  }

  async disable(id: number): Promise<boolean> {
    const result = await this.db.update('api_keys', { id }, { is_active: false })
    return !!result
  }

  async enable(id: number): Promise<boolean> {
    const result = await this.db.update('api_keys', { id }, { is_active: true })
    return !!result
  }
}