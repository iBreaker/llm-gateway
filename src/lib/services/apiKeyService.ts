import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { ServiceError, PaginatedResponse, PaginationParams, SortParams } from './index';

// API密钥相关类型定义
export interface CreateApiKeyData {
  name: string;
  permissions: string[];
  rateLimits: {
    per_minute: number;
    per_hour: number;
  };
  expiresAt?: string | Date;
}

export interface UpdateApiKeyData {
  name?: string;
  permissions?: string[];
  rateLimits?: {
    per_minute?: number;
    per_hour?: number;
  };
  isActive?: boolean;
  expiresAt?: string | Date | null;
}

export interface ApiKeyPublicInfo {
  id: string;
  name: string;
  keyHash: string; // 脱敏后的密钥
  permissions: string[];
  rateLimits: Record<string, any>;
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyCreateResponse {
  apiKey: ApiKeyPublicInfo;
  plainKey: string; // 明文密钥，仅创建时返回
}

export interface ApiKeyListParams extends PaginationParams, SortParams {
  isActive?: boolean;
  hasExpired?: boolean;
  search?: string;
}

/**
 * API密钥服务类
 * 处理所有API密钥相关的业务逻辑
 */
export class ApiKeyService {

  // 有效权限列表
  private static readonly VALID_PERMISSIONS = [
    'anthropic.messages',
    'openai.chat', 
    'google.generate',
    'admin'
  ];

  /**
   * 创建API密钥
   */
  static async createApiKey(userId: bigint, keyData: CreateApiKeyData): Promise<ApiKeyCreateResponse> {
    // 验证必填字段
    if (!keyData.name || !keyData.permissions || !Array.isArray(keyData.permissions) || keyData.permissions.length === 0) {
      throw new ServiceError('名称和权限为必填项', 'MISSING_REQUIRED_FIELDS', 400);
    }

    // 验证权限
    const invalidPermissions = keyData.permissions.filter(p => !this.VALID_PERMISSIONS.includes(p));
    if (invalidPermissions.length > 0) {
      throw new ServiceError(`无效的权限: ${invalidPermissions.join(', ')}`, 'INVALID_PERMISSIONS', 400);
    }

    // 验证限流设置
    if (!keyData.rateLimits || typeof keyData.rateLimits !== 'object') {
      throw new ServiceError('限流设置为必填项', 'MISSING_RATE_LIMITS', 400);
    }

    if (!keyData.rateLimits.per_minute || !keyData.rateLimits.per_hour) {
      throw new ServiceError('每分钟和每小时限制为必填项', 'INVALID_RATE_LIMITS', 400);
    }

    if (keyData.rateLimits.per_minute <= 0 || keyData.rateLimits.per_hour <= 0) {
      throw new ServiceError('限流值必须大于0', 'INVALID_RATE_LIMIT_VALUE', 400);
    }

    // 处理过期时间
    let expirationDate: Date | null = null;
    if (keyData.expiresAt) {
      expirationDate = new Date(keyData.expiresAt);
      if (isNaN(expirationDate.getTime())) {
        throw new ServiceError('无效的过期时间格式', 'INVALID_EXPIRATION_DATE', 400);
      }
      if (expirationDate <= new Date()) {
        throw new ServiceError('过期时间必须在未来', 'EXPIRATION_IN_PAST', 400);
      }
    }

    try {
      // 生成API Key
      const plainKey = `sk-${nanoid(48)}`;
      const keyHash = await bcrypt.hash(plainKey, 12);

      // 创建API Key
      const apiKey = await prisma.apiKey.create({
        data: {
          userId,
          name: keyData.name,
          keyHash,
          permissions: JSON.parse(JSON.stringify(keyData.permissions)),
          rateLimits: JSON.parse(JSON.stringify(keyData.rateLimits)),
          isActive: true,
          expiresAt: expirationDate,
          requestCount: 0
        },
        select: {
          id: true,
          name: true,
          keyHash: true,
          permissions: true,
          rateLimits: true,
          isActive: true,
          expiresAt: true,
          lastUsedAt: true,
          requestCount: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return {
        apiKey: this.formatApiKeyInfo(apiKey),
        plainKey
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('API密钥名称已存在', 'DUPLICATE_NAME', 409);
      }
      throw new ServiceError('创建API密钥失败', 'CREATE_API_KEY_FAILED', 500);
    }
  }

  /**
   * 获取用户的API密钥列表
   */
  static async getApiKeysByUser(userId: bigint, params: ApiKeyListParams = {}): Promise<PaginatedResponse<ApiKeyPublicInfo>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
      hasExpired,
      search
    } = params;

    // 构建查询条件
    const where: any = { userId };
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    
    if (hasExpired !== undefined) {
      if (hasExpired) {
        where.expiresAt = { lte: new Date() };
      } else {
        where.OR = [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ];
      }
    }
    
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // 构建排序条件
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    try {
      const [apiKeys, total] = await Promise.all([
        prisma.apiKey.findMany({
          where,
          select: {
            id: true,
            name: true,
            keyHash: true,
            permissions: true,
            rateLimits: true,
            isActive: true,
            expiresAt: true,
            lastUsedAt: true,
            requestCount: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        prisma.apiKey.count({ where })
      ]);

      const formattedApiKeys = apiKeys.map(apiKey => this.formatApiKeyInfo(apiKey));

      return {
        data: formattedApiKeys,
        total,
        page,
        pageSize,
        hasNext: page * pageSize < total
      };
    } catch (error) {
      throw new ServiceError('获取API密钥列表失败', 'GET_API_KEYS_FAILED', 500);
    }
  }

  /**
   * 根据ID获取API密钥
   */
  static async getApiKeyById(keyId: bigint, userId?: bigint): Promise<ApiKeyPublicInfo | null> {
    try {
      const where: any = { id: keyId };
      if (userId) {
        where.userId = userId;
      }

      const apiKey = await prisma.apiKey.findFirst({
        where,
        select: {
          id: true,
          name: true,
          keyHash: true,
          permissions: true,
          rateLimits: true,
          isActive: true,
          expiresAt: true,
          lastUsedAt: true,
          requestCount: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return apiKey ? this.formatApiKeyInfo(apiKey) : null;
    } catch (error) {
      throw new ServiceError('获取API密钥信息失败', 'GET_API_KEY_FAILED', 500);
    }
  }

  /**
   * 根据keyHash获取API密钥（用于认证）
   */
  static async getApiKeyByHash(keyHash: string) {
    try {
      return await prisma.apiKey.findUnique({
        where: { keyHash },
        select: {
          id: true,
          userId: true,
          name: true,
          permissions: true,
          rateLimits: true,
          isActive: true,
          expiresAt: true,
          requestCount: true
        }
      });
    } catch (error) {
      throw new ServiceError('获取API密钥失败', 'GET_API_KEY_BY_HASH_FAILED', 500);
    }
  }

  /**
   * 验证API密钥
   */
  static async validateApiKey(plainKey: string): Promise<any | null> {
    if (!plainKey || !plainKey.startsWith('sk-')) {
      return null;
    }

    try {
      // 获取所有API密钥进行比对
      const apiKeys = await prisma.apiKey.findMany({
        where: { isActive: true },
        select: {
          id: true,
          userId: true,
          name: true,
          keyHash: true,
          permissions: true,
          rateLimits: true,
          isActive: true,
          expiresAt: true,
          requestCount: true
        }
      });

      for (const apiKey of apiKeys) {
        const isValid = await bcrypt.compare(plainKey, apiKey.keyHash);
        if (isValid) {
          // 检查是否过期
          if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
            return null; // 已过期
          }
          return apiKey;
        }
      }

      return null;
    } catch (error) {
      throw new ServiceError('验证API密钥失败', 'VALIDATE_API_KEY_FAILED', 500);
    }
  }

  /**
   * 更新API密钥
   */
  static async updateApiKey(keyId: bigint, userId: bigint, updateData: UpdateApiKeyData): Promise<ApiKeyPublicInfo> {
    // 检查API密钥是否存在且属于该用户
    const existingKey = await this.getApiKeyById(keyId, userId);
    if (!existingKey) {
      throw new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404);
    }

    // 验证权限
    if (updateData.permissions) {
      const invalidPermissions = updateData.permissions.filter(p => !this.VALID_PERMISSIONS.includes(p));
      if (invalidPermissions.length > 0) {
        throw new ServiceError(`无效的权限: ${invalidPermissions.join(', ')}`, 'INVALID_PERMISSIONS', 400);
      }
    }

    // 验证限流设置
    if (updateData.rateLimits) {
      if (updateData.rateLimits.per_minute && updateData.rateLimits.per_minute <= 0) {
        throw new ServiceError('每分钟限制必须大于0', 'INVALID_RATE_LIMIT_VALUE', 400);
      }
      if (updateData.rateLimits.per_hour && updateData.rateLimits.per_hour <= 0) {
        throw new ServiceError('每小时限制必须大于0', 'INVALID_RATE_LIMIT_VALUE', 400);
      }
    }

    // 处理过期时间
    let expirationDate: Date | null = undefined as any;
    if (updateData.expiresAt !== undefined) {
      if (updateData.expiresAt === null) {
        expirationDate = null;
      } else {
        expirationDate = new Date(updateData.expiresAt);
        if (isNaN(expirationDate.getTime())) {
          throw new ServiceError('无效的过期时间格式', 'INVALID_EXPIRATION_DATE', 400);
        }
        if (expirationDate <= new Date()) {
          throw new ServiceError('过期时间必须在未来', 'EXPIRATION_IN_PAST', 400);
        }
      }
    }

    try {
      const updatePayload: any = {};
      
      if (updateData.name) updatePayload.name = updateData.name;
      if (updateData.permissions) updatePayload.permissions = JSON.parse(JSON.stringify(updateData.permissions));
      if (updateData.rateLimits) updatePayload.rateLimits = JSON.parse(JSON.stringify(updateData.rateLimits));
      if (updateData.isActive !== undefined) updatePayload.isActive = updateData.isActive;
      if (expirationDate !== undefined) updatePayload.expiresAt = expirationDate;

      const apiKey = await prisma.apiKey.update({
        where: { id: keyId },
        data: updatePayload,
        select: {
          id: true,
          name: true,
          keyHash: true,
          permissions: true,
          rateLimits: true,
          isActive: true,
          expiresAt: true,
          lastUsedAt: true,
          requestCount: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return this.formatApiKeyInfo(apiKey);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('API密钥名称已存在', 'DUPLICATE_NAME', 409);
      }
      if (error.code === 'P2025') {
        throw new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404);
      }
      throw new ServiceError('更新API密钥失败', 'UPDATE_API_KEY_FAILED', 500);
    }
  }

  /**
   * 删除API密钥
   */
  static async deleteApiKey(keyId: bigint, userId: bigint): Promise<boolean> {
    try {
      const result = await prisma.apiKey.deleteMany({
        where: {
          id: keyId,
          userId
        }
      });

      if (result.count === 0) {
        throw new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404);
      }

      return true;
    } catch (error: any) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('删除API密钥失败', 'DELETE_API_KEY_FAILED', 500);
    }
  }

  /**
   * 更新API密钥使用统计
   */
  static async updateUsageStats(keyId: bigint): Promise<void> {
    try {
      await prisma.apiKey.update({
        where: { id: keyId },
        data: {
          lastUsedAt: new Date(),
          requestCount: { increment: 1 }
        }
      });
    } catch (error) {
      // 使用统计更新失败不应该影响正常请求
      console.error('更新API密钥使用统计失败:', error);
    }
  }

  /**
   * 格式化API密钥信息（脱敏处理）
   */
  private static formatApiKeyInfo(apiKey: any): ApiKeyPublicInfo {
    return {
      id: apiKey.id.toString(),
      name: apiKey.name,
      keyHash: `sk-****${apiKey.keyHash.slice(-8)}`, // 只显示后8位
      permissions: Array.isArray(apiKey.permissions) ? apiKey.permissions : [],
      rateLimits: typeof apiKey.rateLimits === 'object' ? apiKey.rateLimits : {},
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt?.toISOString() || null,
      lastUsedAt: apiKey.lastUsedAt?.toISOString() || null,
      requestCount: Number(apiKey.requestCount),
      createdAt: apiKey.createdAt.toISOString(),
      updatedAt: apiKey.updatedAt.toISOString()
    };
  }

  /**
   * 获取API密钥统计信息
   */
  static async getApiKeyStats(userId: bigint) {
    try {
      const now = new Date();
      const [totalKeys, activeKeys, expiredKeys] = await Promise.all([
        prisma.apiKey.count({ where: { userId } }),
        prisma.apiKey.count({ where: { userId, isActive: true } }),
        prisma.apiKey.count({ 
          where: { 
            userId, 
            expiresAt: { lte: now }
          } 
        })
      ]);

      return {
        totalKeys,
        activeKeys,
        inactiveKeys: totalKeys - activeKeys,
        expiredKeys
      };
    } catch (error) {
      throw new ServiceError('获取API密钥统计失败', 'GET_API_KEY_STATS_FAILED', 500);
    }
  }

  /**
   * 批量更新API密钥状态
   */
  static async batchUpdateStatus(keyIds: bigint[], userId: bigint, isActive: boolean): Promise<number> {
    try {
      const result = await prisma.apiKey.updateMany({
        where: {
          id: { in: keyIds },
          userId
        },
        data: { isActive }
      });

      return result.count;
    } catch (error) {
      throw new ServiceError('批量更新API密钥状态失败', 'BATCH_UPDATE_FAILED', 500);
    }
  }
}