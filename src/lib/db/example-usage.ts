/**
 * 新架构使用示例
 * 展示如何使用分层架构进行数据访问
 */

import { createDatabaseAdapter } from '../adapters'
import { RepositoryFactory } from './repositories'
import { MigrationManager } from './schemas/migration-manager'
import type { DatabaseConfig } from '../interfaces/database'

// ==========================================
// 示例：初始化和使用新架构
// ==========================================

export class DatabaseService {
  private adapter?: any
  private repositoryFactory?: RepositoryFactory

  /**
   * 初始化数据库服务
   */
  async initialize(config: DatabaseConfig): Promise<void> {
    // 1. 创建数据库适配器（纯粹的数据访问层）
    this.adapter = await createDatabaseAdapter(config)
    await this.adapter.connect()

    // 2. 执行数据库迁移（统一的结构管理）
    const migrationManager = new MigrationManager(this.adapter)
    if (!(await migrationManager.isInitialized())) {
      await migrationManager.migrate()
    }

    // 3. 创建 Repository 工厂（业务数据访问层）
    this.repositoryFactory = new RepositoryFactory(this.adapter)

    console.log('✅ 数据库服务初始化完成')
  }

  /**
   * 获取 Repository 工厂
   */
  getRepositoryFactory(): RepositoryFactory {
    if (!this.repositoryFactory) {
      throw new Error('数据库服务未初始化')
    }
    return this.repositoryFactory
  }

  /**
   * 关闭数据库连接
   */
  async shutdown(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect()
    }
  }
}

// ==========================================
// 使用示例：用户管理
// ==========================================

export class UserService {
  constructor(private databaseService: DatabaseService) {}

  async createUser(email: string, username: string, passwordHash: string) {
    const userRepo = this.databaseService.getRepositoryFactory().createUserRepository()
    
    // 检查用户是否已存在
    if (await userRepo.emailExists(email)) {
      throw new Error('邮箱已存在')
    }
    
    if (await userRepo.usernameExists(username)) {
      throw new Error('用户名已存在')
    }

    // 创建用户（业务逻辑在 Repository 层）
    return userRepo.create({
      email,
      username,
      passwordHash,
      role: 'user',
      isActive: true
    })
  }

  async authenticateUser(email: string, passwordHash: string) {
    const userRepo = this.databaseService.getRepositoryFactory().createUserRepository()
    
    const user = await userRepo.findByEmail(email)
    if (!user || !user.isActive) {
      return null
    }

    // 这里应该有密码验证逻辑
    if (user.passwordHash === passwordHash) {
      return user
    }
    
    return null
  }

  async getUserApiKeys(userId: number) {
    const apiKeyRepo = this.databaseService.getRepositoryFactory().createApiKeyRepository()
    return apiKeyRepo.findByUserId(userId)
  }
}

// ==========================================
// 配置示例
// ==========================================

export const databaseConfigs = {
  // SQLite 配置
  sqlite: {
    type: 'sqlite' as const,
    url: 'file:./data/app.db'
  },

  // PostgreSQL 配置
  postgresql: {
    type: 'postgresql' as const,
    url: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/mydb'
  },

  // Supabase 配置
  supabase: {
    type: 'supabase' as const,
    url: process.env.SUPABASE_URL || 'https://your-project.supabase.co'
  }
}

// ==========================================
// 启动示例
// ==========================================

export async function initializeApp() {
  const databaseService = new DatabaseService()
  
  // 根据环境选择数据库配置
  const config = process.env.NODE_ENV === 'production' 
    ? databaseConfigs.supabase 
    : databaseConfigs.sqlite

  await databaseService.initialize(config)
  
  const userService = new UserService(databaseService)
  
  // 现在可以使用业务服务了
  // const user = await userService.createUser('test@example.com', 'testuser', 'hashed_password')
  // const apiKeys = await userService.getUserApiKeys(user.id)

  return { databaseService, userService }
}

// ==========================================
// 架构优势总结：
// 1. 关注点分离：适配器专注技术实现，Repository 处理业务逻辑
// 2. 可维护性：表结构统一管理，避免重复代码
// 3. 可测试性：每层都可以独立测试
// 4. 扩展性：新增数据库适配器时不需要重复实现业务方法
// 5. 一致性：所有数据库使用相同的表结构和迁移脚本
// ==========================================