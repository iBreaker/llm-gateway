# 测试文档

本项目包含全面的单元测试和集成测试，确保代码质量和系统稳定性。

## 测试结构

```
tests/
├── unit/                    # 单元测试
│   ├── adapters/           # 适配器测试
│   │   ├── database/       # 数据库适配器测试
│   │   ├── cache/          # 缓存适配器测试
│   │   └── storage/        # 存储适配器测试
│   └── lib/                # 核心库测试
├── integration/            # 集成测试
├── helpers/                # 测试辅助工具
└── fixtures/               # 测试数据固件
```

## 运行测试

### 基础命令

```bash
# 运行所有测试
npm test

# 监视模式运行测试
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage

# 只运行单元测试
npm run test:unit

# 只运行集成测试
npm run test:integration

# CI 环境运行测试
npm run test:ci

# 调试模式运行测试
npm run test:debug
```

### 特定测试文件

```bash
# 运行特定测试文件
npm test sqlite.test.ts

# 运行特定测试套件
npm test -- --testNamePattern="数据库适配器"

# 监视特定文件夹
npm run test:watch -- tests/unit/adapters
```

## 测试覆盖率

项目要求的测试覆盖率标准：

- **分支覆盖率**: ≥ 70%
- **函数覆盖率**: ≥ 75%
- **行覆盖率**: ≥ 75%
- **语句覆盖率**: ≥ 75%

## 测试类型

### 1. 单元测试

测试单个组件或函数的功能，包括：

- 数据库适配器 (SQLite/PostgreSQL)
- 缓存适配器 (Memory/Redis)
- 存储适配器 (Local/Vercel Blob)
- 系统配置和验证
- 工具函数

### 2. 集成测试

测试多个组件协同工作的场景：

- 系统初始化和关闭
- 适配器之间的数据流
- 完整的业务流程
- 错误处理和恢复

## 测试工具和库

- **Jest**: 测试框架
- **@testing-library/jest-dom**: DOM 测试工具
- **TypeScript**: 类型安全的测试代码

## 测试数据

### 测试数据库

测试使用内存 SQLite 数据库 (`:memory:`)，确保：
- 测试之间相互隔离
- 快速执行
- 无副作用

### 测试缓存

使用内存缓存适配器，配置：
- 最大内存：10MB
- 默认 TTL：60 秒

### 测试存储

使用临时目录进行文件存储测试：
- 每个测试使用独立的临时目录
- 测试结束后自动清理

## 测试辅助工具

### TestUtils

提供常用的测试辅助函数：

```typescript
// 生成测试 ID
const id = generateTestId('user')

// 创建临时目录
const tempDir = await createTempDir()

// 清理临时目录
await cleanupTempDir(tempDir)

// 创建测试配置
const dbConfig = createTestDatabaseConfig()
const cacheConfig = createTestCacheConfig()
const storageConfig = createTestStorageConfig(tempDir)

// 等待指定时间
await sleep(1000)
```

### MockStorageAdapter

模拟存储适配器，用于测试：

```typescript
const mockStorage = new MockStorageAdapter()
await mockStorage.put('test-key', 'test-data')
const data = await mockStorage.get('test-key')
```

### TestData

生成测试数据：

```typescript
const user = TestData.user({ name: 'Custom Name' })
const apiKey = TestData.apiKey({ userId: user.id })
const account = TestData.upstreamAccount({ service: 'claude' })
```

## 最佳实践

### 1. 测试隔离

- 每个测试使用独立的数据库连接
- 使用临时目录避免文件冲突
- 清理测试资源避免内存泄漏

### 2. 异步测试

```typescript
test('异步操作测试', async () => {
  const result = await asyncFunction()
  expect(result).toBeDefined()
})
```

### 3. 错误测试

```typescript
test('应该抛出特定错误', async () => {
  await expect(functionThatShouldThrow()).rejects.toThrow('Expected error message')
})
```

### 4. Mock 使用

```typescript
const mockFn = jest.fn().mockResolvedValue('mocked result')
expect(mockFn).toHaveBeenCalledWith('expected argument')
```

### 5. 清理资源

```typescript
afterEach(async () => {
  if (adapter) {
    await adapter.disconnect()
  }
  await cleanupTempDir(tempDir)
  await cleanupTest()
})
```

## 调试测试

### 1. 使用调试模式

```bash
npm run test:debug
```

然后在 Chrome 中打开 `chrome://inspect`。

### 2. 添加断点

```typescript
test('调试测试', async () => {
  debugger; // 在这里设置断点
  const result = await functionToTest()
  expect(result).toBeDefined()
})
```

### 3. 查看详细输出

```bash
npm test -- --verbose
```

## 持续集成

在 CI 环境中运行测试：

```bash
npm run test:ci
```

这会：
- 禁用监视模式
- 生成覆盖率报告
- 使用适合 CI 的输出格式

## 性能测试

长时间运行的测试需要设置超时：

```typescript
test('长时间运行的测试', async () => {
  // 测试逻辑
}, 60000) // 60 秒超时
```

## 故障排除

### 常见问题

1. **测试超时**: 检查异步操作是否正确等待
2. **资源未清理**: 确保在 `afterEach` 中清理所有资源
3. **端口冲突**: 使用随机端口或确保端口可用
4. **文件权限**: 确保临时目录有写入权限

### 调试技巧

1. 使用 `console.log` 输出调试信息
2. 检查测试数据是否正确生成
3. 验证 Mock 函数是否按预期调用
4. 使用 Jest 的 `--runInBand` 标志串行运行测试

## 贡献指南

添加新测试时请遵循：

1. 为新功能编写相应的测试
2. 保持测试简洁和专注
3. 使用描述性的测试名称
4. 确保测试能够稳定通过
5. 维护适当的测试覆盖率