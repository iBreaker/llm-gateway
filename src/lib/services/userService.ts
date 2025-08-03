import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { ServiceError, PaginatedResponse, PaginationParams, SortParams } from './index';
import { formatUser, formatUsers, formatPaginatedResponse } from '@/lib/utils/response-formatter';
import { toBigInt, parseRequestId, formatEntityWithId } from '@/lib/utils/id-converter';

// 用户相关类型定义
export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserData {
  email?: string;
  username?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserPublicInfo {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface UserListParams extends PaginationParams, SortParams {
  role?: UserRole;
  isActive?: boolean;
  search?: string; // 搜索邮箱或用户名
}

/**
 * 用户服务类
 * 处理所有用户相关的业务逻辑
 */
export class UserService {
  
  /**
   * 创建新用户
   */
  static async createUser(userData: CreateUserData): Promise<UserPublicInfo> {
    // 验证必填字段
    if (!userData.email || !userData.username || !userData.password || !userData.role) {
      throw new ServiceError('邮箱、用户名、密码和角色为必填项', 'MISSING_REQUIRED_FIELDS', 400);
    }

    // 验证角色有效性
    if (!['ADMIN', 'USER', 'READONLY'].includes(userData.role)) {
      throw new ServiceError('无效的用户角色', 'INVALID_ROLE', 400);
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      throw new ServiceError('邮箱格式不正确', 'INVALID_EMAIL_FORMAT', 400);
    }

    // 验证密码强度
    if (userData.password.length < 8) {
      throw new ServiceError('密码长度至少8位', 'WEAK_PASSWORD', 400);
    }

    // 检查邮箱和用户名是否已存在
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { username: userData.username }
        ]
      },
      select: { email: true, username: true }
    });

    if (existingUser) {
      if (existingUser.email === userData.email) {
        throw new ServiceError('邮箱已存在', 'EMAIL_EXISTS', 409);
      }
      if (existingUser.username === userData.username) {
        throw new ServiceError('用户名已存在', 'USERNAME_EXISTS', 409);
      }
    }

    try {
      // 加密密码
      const passwordHash = await bcrypt.hash(userData.password, 12);

      // 创建用户
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          username: userData.username,
          passwordHash,
          role: userData.role,
          isActive: true
        },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return this.formatUserInfo(user);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('邮箱或用户名已存在', 'DUPLICATE_ENTRY', 409);
      }
      throw new ServiceError('创建用户失败', 'CREATE_USER_FAILED', 500);
    }
  }

  /**
   * 获取用户列表
   */
  static async getUsers(params: UserListParams = {}): Promise<PaginatedResponse<UserPublicInfo>> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      role,
      isActive,
      search
    } = params;

    // 构建查询条件
    const where: any = {};
    
    if (role) {
      where.role = role;
    }
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } }
      ];
    }

    // 构建排序条件
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    try {
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        prisma.user.count({ where })
      ]);

      const formattedUsers = users.map(user => this.formatUserInfo(user));

      return {
        data: formattedUsers,
        total,
        page,
        pageSize,
        hasNext: page * pageSize < total
      };
    } catch (error) {
      throw new ServiceError('获取用户列表失败', 'GET_USERS_FAILED', 500);
    }
  }

  /**
   * 根据ID获取用户
   */
  static async getUserById(userId: string | number | bigint): Promise<UserPublicInfo | null> {
    try {
      const id = toBigInt(userId);
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return user ? this.formatUserInfo(user) : null;
    } catch (error) {
      throw new ServiceError('获取用户信息失败', 'GET_USER_FAILED', 500);
    }
  }

  /**
   * 根据邮箱获取用户（包含密码哈希，用于登录验证）
   */
  static async getUserByEmailWithPassword(email: string) {
    try {
      return await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          passwordHash: true,
          role: true,
          isActive: true
        }
      });
    } catch (error) {
      throw new ServiceError('获取用户信息失败', 'GET_USER_FAILED', 500);
    }
  }

  /**
   * 更新用户信息
   */
  static async updateUser(userId: string | number | bigint, updateData: UpdateUserData): Promise<UserPublicInfo> {
    // 检查用户是否存在
    const existingUser = await this.getUserById(userId);
    if (!existingUser) {
      throw new ServiceError('用户不存在', 'USER_NOT_FOUND', 404);
    }

    // 如果更新邮箱或用户名，检查是否冲突
    if (updateData.email || updateData.username) {
      const conflicts = await prisma.user.findFirst({
        where: {
          AND: [
            { id: { not: userId } }, // 排除当前用户
            {
              OR: [
                updateData.email ? { email: updateData.email } : {},
                updateData.username ? { username: updateData.username } : {}
              ].filter(condition => Object.keys(condition).length > 0)
            }
          ]
        }
      });

      if (conflicts) {
        throw new ServiceError('邮箱或用户名已存在', 'DUPLICATE_ENTRY', 409);
      }
    }

    try {
      const updatePayload: any = { ...updateData };
      
      // 如果更新密码，需要加密
      if (updateData.password) {
        updatePayload.passwordHash = await bcrypt.hash(updateData.password, 12);
        delete updatePayload.password;
      }

      const id = toBigInt(userId);
      const user = await prisma.user.update({
        where: { id },
        data: updatePayload,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return this.formatUserInfo(user);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ServiceError('邮箱或用户名已存在', 'DUPLICATE_ENTRY', 409);
      }
      if (error.code === 'P2025') {
        throw new ServiceError('用户不存在', 'USER_NOT_FOUND', 404);
      }
      throw new ServiceError('更新用户失败', 'UPDATE_USER_FAILED', 500);
    }
  }

  /**
   * 删除用户
   */
  static async deleteUser(userId: string | number | bigint): Promise<boolean> {
    try {
      const id = toBigInt(userId);
      await prisma.user.delete({
        where: { id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new ServiceError('用户不存在', 'USER_NOT_FOUND', 404);
      }
      throw new ServiceError('删除用户失败', 'DELETE_USER_FAILED', 500);
    }
  }

  /**
   * 验证用户密码
   */
  static async verifyPassword(email: string, password: string): Promise<UserPublicInfo | null> {
    const user = await this.getUserByEmailWithPassword(email);
    
    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    // 返回不包含密码的用户信息
    return {
      id: user.id.toString(),
      email: user.email,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      createdAt: new Date().toISOString(), // 这里应该从数据库获取，暂时用当前时间
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * 格式化用户信息（移除敏感数据，统一格式）
   */
  private static formatUserInfo(user: any): UserPublicInfo {
    return formatUser(user);
  }

  /**
   * 检查用户是否有指定权限
   */
  static async hasPermission(userId: string | number | bigint, requiredRoles: UserRole[]): Promise<boolean> {
    const user = await this.getUserById(userId);
    return user ? requiredRoles.includes(user.role as UserRole) : false;
  }

  /**
   * 获取用户统计信息
   */
  static async getUserStats() {
    try {
      const [totalUsers, activeUsers, adminUsers] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { role: 'ADMIN' } })
      ]);

      return {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        adminUsers
      };
    } catch (error) {
      throw new ServiceError('获取用户统计失败', 'GET_USER_STATS_FAILED', 500);
    }
  }
}