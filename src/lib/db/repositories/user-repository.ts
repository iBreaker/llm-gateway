import type { DatabaseAdapter } from '../../interfaces/database'
import type { DatabaseUser } from '../../interfaces/database'
import type { 
  UserRepository, 
  CreateUserData, 
  UpdateUserData,
  QueryOptions 
} from '../../interfaces/repositories'

/**
 * 用户 Repository 实现
 * 处理用户相关的业务数据访问逻辑
 */
export class UserRepositoryImpl implements UserRepository {
  constructor(private db: DatabaseAdapter) {}

  async findById(id: number): Promise<DatabaseUser | null> {
    return this.db.findOne<DatabaseUser>('users', { id })
  }

  async findMany(where?: Record<string, any>, options?: QueryOptions): Promise<DatabaseUser[]> {
    return this.db.findMany<DatabaseUser>('users', where, options)
  }

  async create(data: CreateUserData): Promise<DatabaseUser> {
    return this.db.create<DatabaseUser>('users', {
      email: data.email,
      username: data.username,
      password_hash: data.passwordHash,
      role: data.role || 'user',
      is_active: data.isActive ?? true
    })
  }

  async update(id: number, data: UpdateUserData): Promise<DatabaseUser | null> {
    const updateData: Record<string, any> = {}
    
    if (data.email !== undefined) updateData.email = data.email
    if (data.username !== undefined) updateData.username = data.username
    if (data.passwordHash !== undefined) updateData.password_hash = data.passwordHash
    if (data.role !== undefined) updateData.role = data.role
    if (data.isActive !== undefined) updateData.is_active = data.isActive

    if (Object.keys(updateData).length === 0) {
      return this.findById(id)
    }

    try {
      return await this.db.update<DatabaseUser>('users', { id }, updateData)
    } catch {
      return null
    }
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.delete('users', { id })
    return result > 0
  }

  async exists(id: number): Promise<boolean> {
    return this.db.exists('users', { id })
  }

  async count(where?: Record<string, any>): Promise<number> {
    return this.db.count('users', where)
  }

  // 业务特定方法
  async findByEmail(email: string): Promise<DatabaseUser | null> {
    return this.db.findOne<DatabaseUser>('users', { email })
  }

  async findByUsername(username: string): Promise<DatabaseUser | null> {
    return this.db.findOne<DatabaseUser>('users', { username })
  }

  async emailExists(email: string): Promise<boolean> {
    return this.db.exists('users', { email })
  }

  async usernameExists(username: string): Promise<boolean> {
    return this.db.exists('users', { username })
  }

  async findActiveUsers(): Promise<DatabaseUser[]> {
    return this.db.findMany<DatabaseUser>('users', { is_active: true })
  }

  async findByRole(role: string): Promise<DatabaseUser[]> {
    return this.db.findMany<DatabaseUser>('users', { role })
  }
}