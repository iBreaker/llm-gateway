import type { BaseRepository } from './base'
import type { DatabaseUser } from '../database'

/**
 * 用户数据创建接口
 */
export interface CreateUserData {
  email: string
  username: string
  passwordHash: string
  role?: string
  isActive?: boolean
}

/**
 * 用户数据更新接口
 */
export interface UpdateUserData {
  email?: string
  username?: string
  passwordHash?: string
  role?: string
  isActive?: boolean
}

/**
 * 用户 Repository 接口
 * 定义用户相关的业务数据访问方法
 */
export interface UserRepository extends BaseRepository<DatabaseUser, CreateUserData, UpdateUserData> {
  /**
   * 根据邮箱查找用户
   */
  findByEmail(email: string): Promise<DatabaseUser | null>

  /**
   * 根据用户名查找用户
   */
  findByUsername(username: string): Promise<DatabaseUser | null>

  /**
   * 检查邮箱是否已存在
   */
  emailExists(email: string): Promise<boolean>

  /**
   * 检查用户名是否已存在
   */
  usernameExists(username: string): Promise<boolean>

  /**
   * 获取活跃用户列表
   */
  findActiveUsers(): Promise<DatabaseUser[]>

  /**
   * 根据角色查找用户
   */
  findByRole(role: string): Promise<DatabaseUser[]>
}