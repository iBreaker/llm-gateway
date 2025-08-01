# 数据库架构重构说明

## 🎯 重构目标

解决原架构中的两个核心问题：
1. **数据表结构重复定义** - 在不同适配器中重复定义相同的表结构
2. **适配器业务耦合** - 适配器包含了业务相关的方法

## 📊 架构对比

### ❌ 重构前的问题

```
src/lib/adapters/database/
├── sqlite.ts          # 包含表结构 + 业务方法
├── postgres.ts        # 包含表结构 + 业务方法  
└── supabase.ts        # 包含表结构 + 业务方法

问题：
- 表结构在每个适配器中重复定义
- 适配器包含 createUser、getApiKeyByHash 等业务方法
- 违反单一职责原则和 DRY 原则
```

### ✅ 重构后的架构

```
src/lib/
├── db/
│   ├── schemas/                    # 📁 统一的数据结构管理
│   │   ├── tables.sql             # 表结构定义
│   │   ├── indexes.sql            # 索引定义
│   │   ├── triggers.sql           # 触发器定义
│   │   └── migration-manager.ts   # 迁移管理器
│   └── repositories/               # 📁 业务数据访问层
│       ├── user-repository.ts     # 用户业务逻辑
│       ├── api-key-repository.ts  # API 密钥业务逻辑
│       └── index.ts               # Repository 工厂
├── adapters/database/              # 📁 纯粹的数据访问层
│   ├── sqlite.ts                  # 只包含 SQLite 技术实现
│   ├── postgres.ts                # 只包含 PostgreSQL 技术实现
│   └── supabase-clean.ts          # 只包含 Supabase 技术实现
└── interfaces/repositories/       # 📁 业务接口定义
    ├── base.ts                    # 基础 Repository 接口
    ├── user-repository.ts         # 用户 Repository 接口
    └── api-key-repository.ts      # API 密钥 Repository 接口
```

## 🏗️ 新架构层级

### 1. **Schema 层** - 数据结构管理
- **职责**：统一管理数据表结构、索引、触发器
- **位置**：`src/lib/db/schemas/`
- **优势**：一处定义，处处使用，确保一致性

### 2. **Adapter 层** - 技术实现
- **职责**：提供纯粹的数据库操作接口
- **方法**：`findOne`、`findMany`、`create`、`update`、`delete`
- **特点**：无业务逻辑，可替换

### 3. **Repository 层** - 业务数据访问
- **职责**：处理业务相关的数据访问逻辑
- **方法**：`findByEmail`、`emailExists`、`findActiveUsers`
- **特点**：封装业务规则，使用适配器的基础接口

### 4. **Service 层** - 业务逻辑
- **职责**：协调多个 Repository，处理复杂业务逻辑
- **示例**：用户注册、认证、权限验证

## 📈 架构优势

### 1. **关注点分离**
- 适配器专注技术实现
- Repository 处理业务逻辑
- Schema 管理数据结构

### 2. **DRY 原则**
- 表结构只定义一次
- 业务方法不在适配器中重复

### 3. **可维护性**
- 修改表结构只需更新一个地方
- 业务逻辑集中在 Repository 层

### 4. **可测试性**
- 每层都可以独立测试
- Repository 可以使用 Mock 适配器测试

### 5. **扩展性**
- 新增数据库适配器无需重复实现业务方法
- 新增业务功能只需扩展 Repository

## 🔄 迁移指南

### 旧代码模式
```typescript
// ❌ 直接使用适配器的业务方法
const user = await adapter.createUser({
  email: 'test@example.com',
  username: 'testuser',
  passwordHash: 'hash123'
})
```

### 新代码模式
```typescript
// ✅ 使用 Repository 层
const userRepo = repositoryFactory.createUserRepository()
const user = await userRepo.create({
  email: 'test@example.com',
  username: 'testuser',
  passwordHash: 'hash123'
})
```

## 📋 最佳实践

### 1. **适配器设计**
- 只提供基础 CRUD 操作
- 不包含任何业务逻辑
- 支持事务和原生 SQL

### 2. **Repository 设计**
- 实现特定的业务接口
- 封装复杂的查询逻辑
- 处理数据验证

### 3. **Schema 管理**
- 使用 SQL 文件定义结构
- 通过 MigrationManager 统一执行
- 版本化管理数据库变更

## 🚀 使用示例

```typescript
// 初始化
const databaseService = new DatabaseService()
await databaseService.initialize(config)

// 获取 Repository
const userRepo = databaseService.getRepositoryFactory().createUserRepository()

// 业务操作
const user = await userRepo.create({ ... })
const users = await userRepo.findActiveUsers()
const exists = await userRepo.emailExists('test@example.com')
```

## 🎉 总结

这次重构完全解决了您提出的两个问题：
1. ✅ 数据表结构现在统一管理在 `schemas/` 目录
2. ✅ 适配器现在是纯粹的技术实现，不包含业务逻辑

新架构提供了更好的可维护性、可测试性和扩展性，符合软件工程的最佳实践。