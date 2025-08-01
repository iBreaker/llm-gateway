// Repository 实现类导出
export { UserRepositoryImpl } from './user-repository'
export { ApiKeyRepositoryImpl } from './api-key-repository'

// Repository 工厂函数
import type { DatabaseAdapter } from '../../interfaces/database'
import type { 
  UserRepository, 
  ApiKeyRepository,
  UpstreamAccountRepository,
  UsageRecordRepository
} from '../../interfaces/repositories'

import { UserRepositoryImpl } from './user-repository'
import { ApiKeyRepositoryImpl } from './api-key-repository'

/**
 * Repository 工厂类
 * 负责创建和管理 Repository 实例
 */
export class RepositoryFactory {
  constructor(private db: DatabaseAdapter) {}

  createUserRepository(): UserRepository {
    return new UserRepositoryImpl(this.db)
  }

  createApiKeyRepository(): ApiKeyRepository {
    return new ApiKeyRepositoryImpl(this.db)
  }

  // TODO: 实现其他 Repository
  // createUpstreamAccountRepository(): UpstreamAccountRepository {
  //   return new UpstreamAccountRepositoryImpl(this.db)
  // }

  // createUsageRecordRepository(): UsageRecordRepository {
  //   return new UsageRecordRepositoryImpl(this.db)
  // }
}