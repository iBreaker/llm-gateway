import { prisma } from '@/lib/prisma';
import { UpstreamType, AccountStatus } from '@prisma/client';
import { ServiceError, PaginatedResponse, PaginationParams, SortParams } from './index';
import { AnthropicClient } from '@/lib/anthropic/client';

// 账号相关类型定义
export interface CreateAccountData {
  name: string;
  type: UpstreamType;
  email?: string;
  credentials: Record<string, any>;
  config?: Record<string, any>;
  priority?: number;
  weight?: number;
}

export interface UpdateAccountData {
  name?: string;
  email?: string;
  credentials?: Record<string, any>;
  config?: Record<string, any>;
  priority?: number;
  weight?: number;
  status?: AccountStatus;
}

export interface AccountPublicInfo {
  id: string;
  name: string;
  type: UpstreamType;
  email: string | null;
  status: AccountStatus;
  priority: number;
  weight: number;
  lastHealthCheck: string | null;
  healthStatus: Record<string, any>;
  lastUsedAt: string | null;
  requestCount: number;
  successCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccountListParams extends PaginationParams, SortParams {
  type?: UpstreamType;
  status?: AccountStatus;
  search?: string;
}

export interface AccountValidationResult {
  valid: boolean;
  error?: string;
  details?: any;
}

/**
 * 上游账号服务类
 * 处理所有上游账号相关的业务逻辑
 */
export class AccountService {

  /**
   * 创建上游账号
   */
  static async createAccount(userId: bigint, accountData: CreateAccountData): Promise<AccountPublicInfo> {
    // 验证必填字段
    if (!accountData.name || !accountData.type || !accountData.credentials) {
      throw new ServiceError('名称、类型和凭据为必填项', 'MISSING_REQUIRED_FIELDS', 400);
    }

    // 验证账号类型
    const validTypes = ['ANTHROPIC_API', 'ANTHROPIC_OAUTH', 'GEMINI_CLI', 'OPENAI_API', 'AZURE_OPENAI', 'GOOGLE_AI'];
    if (!validTypes.includes(accountData.type)) {
      throw new ServiceError('无效的账号类型', 'INVALID_ACCOUNT_TYPE', 400);
    }

    // 对于非 ANTHROPIC_API 类型，邮箱是必填的
    if (accountData.type !== 'ANTHROPIC_API' && !accountData.email) {
      throw new ServiceError('邮箱为必填项', 'EMAIL_REQUIRED', 400);
    }

    // 验证凭据格式
    try {
      await this.validateCredentials(accountData.type, accountData.credentials);
    } catch (error: any) {
      throw new ServiceError(error.message || '凭据验证失败', 'INVALID_CREDENTIALS', 400);
    }

    // 检查邮箱是否已存在（如果提供了邮箱）
    if (accountData.email) {
      const existingAccount = await prisma.upstreamAccount.findFirst({
        where: {
          userId,
          email: accountData.email
        }
      });

      if (existingAccount) {
        throw new ServiceError('该邮箱已存在上游账号', 'EMAIL_EXISTS', 409);
      }
    }

    try {
      // 创建上游账号
      const account = await prisma.upstreamAccount.create({
        data: {
          name: accountData.name,
          type: accountData.type,
          email: accountData.email || null,
          credentials: JSON.parse(JSON.stringify(accountData.credentials)),
          config: JSON.parse(JSON.stringify(accountData.config || {})),
          status: 'PENDING', // 初始状态为PENDING，等待健康检查
          priority: accountData.priority || 1,
          weight: accountData.weight || 100,
          healthStatus: JSON.parse(JSON.stringify({})),
          requestCount: 0,
          successCount: 0,
          errorCount: 0,
          userId
        },
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
          status: true,
          priority: true,
          weight: true,
          lastHealthCheck: true,
          healthStatus: true,
          lastUsedAt: true,
          requestCount: true,
          successCount: true,
          errorCount: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // 异步执行初始健康检查
      this.performHealthCheck(account.id, accountData.type, accountData.credentials).catch(error => {
        console.error('初始健康检查失败:', error);
      });

      return this.formatAccountInfo(account);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('账号信息重复', 'DUPLICATE_ACCOUNT', 409);
      }
      throw new ServiceError('创建账号失败', 'CREATE_ACCOUNT_FAILED', 500);
    }
  }

  /**
   * 获取用户的上游账号列表
   */
  static async getAccountsByUser(userId: bigint, params: AccountListParams = {}): Promise<PaginatedResponse<AccountPublicInfo>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'priority',
      sortOrder = 'desc',
      type,
      status,
      search
    } = params;

    // 构建查询条件
    const where: any = { userId };
    
    if (type) {
      where.type = type;
    }
    
    if (status) {
      where.status = status;
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // 构建排序条件
    const orderBy: any = {};
    if (sortBy === 'priority') {
      orderBy.priority = sortOrder;
    } else {
      orderBy[sortBy] = sortOrder;
    }

    try {
      const [accounts, total] = await Promise.all([
        prisma.upstreamAccount.findMany({
          where,
          select: {
            id: true,
            name: true,
            type: true,
            email: true,
            status: true,
            priority: true,
            weight: true,
            lastHealthCheck: true,
            healthStatus: true,
            lastUsedAt: true,
            requestCount: true,
            successCount: true,
            errorCount: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: [orderBy, { createdAt: 'desc' }],
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        prisma.upstreamAccount.count({ where })
      ]);

      const formattedAccounts = accounts.map(account => this.formatAccountInfo(account));

      return {
        data: formattedAccounts,
        total,
        page,
        pageSize,
        hasNext: page * pageSize < total
      };
    } catch (error) {
      throw new ServiceError('获取账号列表失败', 'GET_ACCOUNTS_FAILED', 500);
    }
  }

  /**
   * 根据ID获取账号
   */
  static async getAccountById(accountId: bigint, userId?: bigint): Promise<AccountPublicInfo | null> {
    try {
      const where: any = { id: accountId };
      if (userId) {
        where.userId = userId;
      }

      const account = await prisma.upstreamAccount.findFirst({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
          status: true,
          priority: true,
          weight: true,
          lastHealthCheck: true,
          healthStatus: true,
          lastUsedAt: true,
          requestCount: true,
          successCount: true,
          errorCount: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return account ? this.formatAccountInfo(account) : null;
    } catch (error) {
      throw new ServiceError('获取账号信息失败', 'GET_ACCOUNT_FAILED', 500);
    }
  }

  /**
   * 更新账号信息
   */
  static async updateAccount(accountId: bigint, userId: bigint, updateData: UpdateAccountData): Promise<AccountPublicInfo> {
    // 检查账号是否存在且属于该用户
    const existingAccount = await this.getAccountById(accountId, userId);
    if (!existingAccount) {
      throw new ServiceError('账号不存在', 'ACCOUNT_NOT_FOUND', 404);
    }

    // 如果更新凭据，需要验证
    if (updateData.credentials) {
      try {
        await this.validateCredentials(existingAccount.type as UpstreamType, updateData.credentials);
      } catch (error: any) {
        throw new ServiceError(error.message || '凭据验证失败', 'INVALID_CREDENTIALS', 400);
      }
    }

    // 如果更新邮箱，检查是否冲突
    if (updateData.email) {
      const conflicts = await prisma.upstreamAccount.findFirst({
        where: {
          AND: [
            { id: { not: accountId } },
            { userId },
            { email: updateData.email }
          ]
        }
      });

      if (conflicts) {
        throw new ServiceError('该邮箱已存在上游账号', 'EMAIL_EXISTS', 409);
      }
    }

    try {
      const updatePayload: any = { ...updateData };
      
      // 如果更新凭据，需要序列化
      if (updateData.credentials) {
        updatePayload.credentials = JSON.parse(JSON.stringify(updateData.credentials));
        // 重新执行健康检查
        this.performHealthCheck(accountId, existingAccount.type as UpstreamType, updateData.credentials).catch(error => {
          console.error('健康检查失败:', error);
        });
      }

      if (updateData.config) {
        updatePayload.config = JSON.parse(JSON.stringify(updateData.config));
      }

      const account = await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: updatePayload,
        select: {
          id: true,
          name: true,
          type: true,
          email: true,
          status: true,
          priority: true,
          weight: true,
          lastHealthCheck: true,
          healthStatus: true,
          lastUsedAt: true,
          requestCount: true,
          successCount: true,
          errorCount: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return this.formatAccountInfo(account);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('账号信息重复', 'DUPLICATE_ACCOUNT', 409);
      }
      if (error.code === 'P2025') {
        throw new ServiceError('账号不存在', 'ACCOUNT_NOT_FOUND', 404);
      }
      throw new ServiceError('更新账号失败', 'UPDATE_ACCOUNT_FAILED', 500);
    }
  }

  /**
   * 删除账号
   */
  static async deleteAccount(accountId: bigint, userId: bigint): Promise<boolean> {
    try {
      const result = await prisma.upstreamAccount.deleteMany({
        where: {
          id: accountId,
          userId
        }
      });

      if (result.count === 0) {
        throw new ServiceError('账号不存在', 'ACCOUNT_NOT_FOUND', 404);
      }

      return true;
    } catch (error: any) {
      if (error instanceof ServiceError) {
        throw error;
      }
      throw new ServiceError('删除账号失败', 'DELETE_ACCOUNT_FAILED', 500);
    }
  }

  /**
   * 切换账号状态
   */
  static async toggleAccountStatus(accountId: bigint, userId: bigint): Promise<AccountPublicInfo> {
    const account = await this.getAccountById(accountId, userId);
    if (!account) {
      throw new ServiceError('账号不存在', 'ACCOUNT_NOT_FOUND', 404);
    }

    const newStatus: AccountStatus = account.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    
    return this.updateAccount(accountId, userId, { status: newStatus });
  }

  /**
   * 执行健康检查
   */
  static async performHealthCheck(accountId: bigint, type: UpstreamType, credentials: Record<string, any>): Promise<void> {
    try {
      console.log(`开始检查账号 ${accountId} 的健康状态...`);
      const startTime = Date.now();
      
      let validationResult: AccountValidationResult;
      
      if (type === 'ANTHROPIC_API') {
        const client = new AnthropicClient(credentials.api_key, credentials.base_url);
        validationResult = await client.validateApiKey();
      } else {
        // 对于其他类型的账号，暂时返回成功
        validationResult = { valid: true };
      }
      
      const responseTime = Date.now() - startTime;

      console.log(`账号 ${accountId} 验证结果:`, validationResult);
      console.log(`响应时间: ${responseTime}ms`);

      if (validationResult.valid) {
        await prisma.upstreamAccount.update({
          where: { id: accountId },
          data: {
            status: 'ACTIVE',
            lastHealthCheck: new Date(),
            healthStatus: JSON.parse(JSON.stringify({
              status: 'success',
              responseTime,
              lastCheck: new Date().toISOString(),
              message: '健康检查成功'
            }))
          }
        });
        console.log(`账号 ${accountId} 健康检查成功`);
      } else {
        throw new Error(validationResult.error || '健康检查失败');
      }

    } catch (error: any) {
      console.error(`账号 ${accountId} 健康检查失败:`, error);
      
      await prisma.upstreamAccount.update({
        where: { id: accountId },
        data: {
          lastHealthCheck: new Date(),
          status: 'ERROR',
          healthStatus: JSON.parse(JSON.stringify({
            status: 'error',
            error: error.message,
            lastCheck: new Date().toISOString(),
            details: error.details || null
          }))
        }
      });
    }
  }

  /**
   * 验证凭据格式和有效性
   */
  private static async validateCredentials(type: UpstreamType, credentials: Record<string, any>): Promise<void> {
    switch (type) {
      case 'ANTHROPIC_API':
        if (!credentials.api_key) {
          throw new Error('Anthropic API Key为必填项');
        }
        if (!credentials.base_url) {
          throw new Error('Base URL为必填项');
        }
        // 验证API Key有效性
        const client = new AnthropicClient(credentials.api_key, credentials.base_url);
        const validationResult = await client.validateApiKey();
        if (!validationResult.valid) {
          throw new Error(validationResult.error || 'Anthropic API Key无效或已过期');
        }
        break;
        
      case 'ANTHROPIC_OAUTH':
        if (!credentials.accessToken) {
          throw new Error('Access Token为必填项');
        }
        break;
        
      case 'GEMINI_CLI':
        if (!credentials.api_key) {
          throw new Error('Gemini API Key为必填项');
        }
        break;
        
      default:
        // 对于其他类型，只做基本检查
        if (!credentials || Object.keys(credentials).length === 0) {
          throw new Error('凭据不能为空');
        }
    }
  }

  /**
   * 格式化账号信息
   */
  private static formatAccountInfo(account: any): AccountPublicInfo {
    return {
      id: account.id.toString(),
      name: account.name,
      type: account.type,
      email: account.email,
      status: account.status,
      priority: account.priority,
      weight: account.weight,
      lastHealthCheck: account.lastHealthCheck?.toISOString() || null,
      healthStatus: typeof account.healthStatus === 'object' ? account.healthStatus : {},
      lastUsedAt: account.lastUsedAt?.toISOString() || null,
      requestCount: Number(account.requestCount),
      successCount: Number(account.successCount),
      errorCount: Number(account.errorCount),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString()
    };
  }

  /**
   * 获取账号统计信息
   */
  static async getAccountStats(userId: bigint) {
    try {
      const [totalAccounts, activeAccounts, errorAccounts, accountsByType] = await Promise.all([
        prisma.upstreamAccount.count({ where: { userId } }),
        prisma.upstreamAccount.count({ where: { userId, status: 'ACTIVE' } }),
        prisma.upstreamAccount.count({ where: { userId, status: 'ERROR' } }),
        prisma.upstreamAccount.groupBy({
          by: ['type'],
          where: { userId },
          _count: { type: true }
        })
      ]);

      const byType: Record<string, number> = {};
      for (const item of accountsByType) {
        byType[item.type] = item._count.type;
      }

      return {
        totalAccounts,
        activeAccounts,
        errorAccounts,
        inactiveAccounts: totalAccounts - activeAccounts - errorAccounts,
        byType
      };
    } catch (error) {
      throw new ServiceError('获取账号统计失败', 'GET_ACCOUNT_STATS_FAILED', 500);
    }
  }
}