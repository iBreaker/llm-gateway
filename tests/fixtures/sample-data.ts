// 测试数据固件
export const sampleUsers = [
  {
    id: 'user-admin-1',
    email: 'admin@llmgw.com',
    name: 'Admin User',
    hashedPassword: '$2b$12$sample.hashed.password.admin',
    role: 'admin' as const,
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'user-regular-1',
    email: 'user@llmgw.com',
    name: 'Regular User',
    hashedPassword: '$2b$12$sample.hashed.password.user',
    role: 'user' as const,
    isActive: true,
    createdAt: '2025-01-01T01:00:00Z',
    updatedAt: '2025-01-01T01:00:00Z',
  },
  {
    id: 'user-inactive-1',
    email: 'inactive@llmgw.com',
    name: 'Inactive User',
    hashedPassword: '$2b$12$sample.hashed.password.inactive',
    role: 'user' as const,
    isActive: false,
    createdAt: '2025-01-01T02:00:00Z',
    updatedAt: '2025-01-01T02:00:00Z',
  }
]

export const sampleApiKeys = [
  {
    id: 'key-admin-read',
    userId: 'user-admin-1',
    name: 'Admin Read Key',
    keyHash: '$2b$12$sample.hashed.key.admin.read',
    permissions: JSON.stringify(['read', 'write', 'admin']),
    expiresAt: null,
    lastUsedAt: '2025-01-01T10:00:00Z',
    isActive: true,
    createdAt: '2025-01-01T00:30:00Z',
    updatedAt: '2025-01-01T10:00:00Z',
  },
  {
    id: 'key-user-limited',
    userId: 'user-regular-1',
    name: 'User Limited Key',
    keyHash: '$2b$12$sample.hashed.key.user.limited',
    permissions: JSON.stringify(['read']),
    expiresAt: '2025-12-31T23:59:59Z',
    lastUsedAt: null,
    isActive: true,
    createdAt: '2025-01-01T01:30:00Z',
    updatedAt: '2025-01-01T01:30:00Z',
  }
]

export const sampleUpstreamAccounts = [
  {
    id: 'account-claude-1',
    userId: 'user-admin-1',
    service: 'claude' as const,
    name: 'Primary Claude Account',
    description: 'Main Claude Code account for production',
    encryptedCredentials: 'encrypted:sample:claude:credentials:1',
    status: 'active' as const,
    accountType: 'dedicated' as const,
    priority: 1,
    proxyConfig: null,
    totalRequests: 1500,
    successfulRequests: 1450,
    lastUsedAt: '2025-01-01T12:00:00Z',
    lastErrorAt: null,
    lastErrorMessage: null,
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T12:00:00Z',
  },
  {
    id: 'account-gemini-1',
    userId: 'user-admin-1',
    service: 'gemini' as const,
    name: 'Primary Gemini Account',
    description: 'Main Gemini CLI account for testing',
    encryptedCredentials: 'encrypted:sample:gemini:credentials:1',
    status: 'active' as const,
    accountType: 'shared' as const,
    priority: 2,
    proxyConfig: JSON.stringify({
      type: 'socks5',
      host: '127.0.0.1',
      port: 1080
    }),
    totalRequests: 800,
    successfulRequests: 750,
    lastUsedAt: '2025-01-01T11:30:00Z',
    lastErrorAt: '2025-01-01T08:00:00Z',
    lastErrorMessage: 'Rate limit exceeded',
    isActive: true,
    createdAt: '2025-01-01T00:15:00Z',
    updatedAt: '2025-01-01T11:30:00Z',
  },
  {
    id: 'account-claude-error',
    userId: 'user-regular-1',
    service: 'claude' as const,
    name: 'Errored Claude Account',
    description: 'Claude account with authentication issues',
    encryptedCredentials: 'encrypted:sample:claude:credentials:error',
    status: 'error' as const,
    accountType: 'shared' as const,
    priority: 3,
    proxyConfig: null,
    totalRequests: 50,
    successfulRequests: 25,
    lastUsedAt: '2025-01-01T06:00:00Z',
    lastErrorAt: '2025-01-01T09:00:00Z',
    lastErrorMessage: 'Invalid authentication token',
    isActive: false,
    createdAt: '2025-01-01T05:00:00Z',
    updatedAt: '2025-01-01T09:00:00Z',
  }
]

export const sampleUsageStats = [
  {
    id: 'stat-claude-success-1',
    userId: 'user-admin-1',
    apiKeyId: 'key-admin-read',
    upstreamAccountId: 'account-claude-1',
    service: 'claude' as const,
    model: 'claude-3-sonnet-20241022',
    endpoint: '/v1/messages',
    method: 'POST',
    statusCode: 200,
    responseTime: 1250,
    inputTokens: 150,
    outputTokens: 300,
    totalTokens: 450,
    inputCost: 0.0045,
    outputCost: 0.0180,
    totalCost: 0.0225,
    requestAt: '2025-01-01T12:00:00Z',
    createdAt: '2025-01-01T12:00:05Z',
  },
  {
    id: 'stat-gemini-success-1',
    userId: 'user-admin-1',
    apiKeyId: 'key-admin-read',
    upstreamAccountId: 'account-gemini-1',
    service: 'gemini' as const,
    model: 'gemini-2.0-flash-exp',
    endpoint: '/v1/models/gemini-2.0-flash-exp:generateContent',
    method: 'POST',
    statusCode: 200,
    responseTime: 850,
    inputTokens: 100,
    outputTokens: 200,
    totalTokens: 300,
    inputCost: 0.0015,
    outputCost: 0.0030,
    totalCost: 0.0045,
    requestAt: '2025-01-01T11:30:00Z',
    createdAt: '2025-01-01T11:30:02Z',
  },
  {
    id: 'stat-claude-error-1',
    userId: 'user-regular-1',
    apiKeyId: 'key-user-limited',
    upstreamAccountId: 'account-claude-error',
    service: 'claude' as const,
    model: 'claude-3-haiku-20241022',
    endpoint: '/v1/messages',
    method: 'POST',
    statusCode: 401,
    responseTime: 200,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    requestAt: '2025-01-01T09:00:00Z',
    createdAt: '2025-01-01T09:00:01Z',
  }
]

export const sampleSystemConfigs = [
  {
    id: 'config-rate-limit',
    key: 'rate_limit_per_minute',
    value: '60',
    description: 'API 请求频率限制 (每分钟)',
    isEditable: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'config-max-tokens',
    key: 'max_tokens_per_request',
    value: '8192',
    description: '单次请求最大 Token 数量',
    isEditable: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'config-maintenance',
    key: 'maintenance_mode',
    value: 'false',
    description: '维护模式开关',
    isEditable: true,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  }
]

// 测试场景数据生成器
export class TestDataGenerator {
  static generateUsers(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `test-user-${i + 1}`,
      email: `user${i + 1}@test.com`,
      name: `Test User ${i + 1}`,
      hashedPassword: `$2b$12$test.hash.${i + 1}`,
      role: i === 0 ? 'admin' as const : 'user' as const,
      isActive: true,
      createdAt: new Date(Date.now() - i * 60000).toISOString(),
      updatedAt: new Date(Date.now() - i * 30000).toISOString(),
    }))
  }

  static generateApiKeys(userIds: string[], count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `test-key-${i + 1}`,
      userId: userIds[i % userIds.length],
      name: `Test API Key ${i + 1}`,
      keyHash: `$2b$12$test.key.hash.${i + 1}`,
      permissions: JSON.stringify(i === 0 ? ['read', 'write', 'admin'] : ['read']),
      expiresAt: i % 2 === 0 ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      lastUsedAt: i % 3 === 0 ? new Date(Date.now() - i * 60000).toISOString() : null,
      isActive: true,
      createdAt: new Date(Date.now() - i * 120000).toISOString(),
      updatedAt: new Date(Date.now() - i * 60000).toISOString(),
    }))
  }

  static generateUpstreamAccounts(userIds: string[], count: number) {
    const services = ['claude', 'gemini'] as const
    const statuses = ['active', 'expired', 'error'] as const
    
    return Array.from({ length: count }, (_, i) => ({
      id: `test-account-${i + 1}`,
      userId: userIds[i % userIds.length],
      service: services[i % services.length],
      name: `Test ${services[i % services.length]} Account ${i + 1}`,
      description: `Test account ${i + 1} for ${services[i % services.length]}`,
      encryptedCredentials: `encrypted:test:${services[i % services.length]}:${i + 1}`,
      status: statuses[i % statuses.length],
      accountType: i % 2 === 0 ? 'shared' as const : 'dedicated' as const,
      priority: i + 1,
      proxyConfig: i % 3 === 0 ? JSON.stringify({
        type: 'socks5',
        host: '127.0.0.1',
        port: 1080
      }) : null,
      totalRequests: Math.floor(Math.random() * 1000),
      successfulRequests: Math.floor(Math.random() * 900),
      lastUsedAt: i % 2 === 0 ? new Date(Date.now() - i * 60000).toISOString() : null,
      lastErrorAt: i % 4 === 0 ? new Date(Date.now() - i * 30000).toISOString() : null,
      lastErrorMessage: i % 4 === 0 ? `Test error message ${i + 1}` : null,
      isActive: statuses[i % statuses.length] !== 'error',
      createdAt: new Date(Date.now() - i * 180000).toISOString(),
      updatedAt: new Date(Date.now() - i * 90000).toISOString(),
    }))
  }

  static generateUsageStats(userIds: string[], keyIds: string[], accountIds: string[], count: number) {
    const services = ['claude', 'gemini'] as const
    const models = ['claude-3-sonnet-20241022', 'claude-3-haiku-20241022', 'gemini-2.0-flash-exp']
    const endpoints = ['/v1/messages', '/v1/models/gemini-2.0-flash-exp:generateContent']
    const statusCodes = [200, 200, 200, 200, 400, 401, 429, 500] // 大部分成功
    
    return Array.from({ length: count }, (_, i) => ({
      id: `test-stat-${i + 1}`,
      userId: userIds[i % userIds.length],
      apiKeyId: keyIds[i % keyIds.length],
      upstreamAccountId: accountIds[i % accountIds.length],
      service: services[i % services.length],
      model: models[i % models.length],
      endpoint: endpoints[i % endpoints.length],
      method: 'POST',
      statusCode: statusCodes[i % statusCodes.length],
      responseTime: Math.floor(Math.random() * 3000) + 200,
      inputTokens: Math.floor(Math.random() * 500) + 50,
      outputTokens: Math.floor(Math.random() * 800) + 100,
      totalTokens: 0, // 会在后面计算
      inputCost: 0,   // 会在后面计算
      outputCost: 0,  // 会在后面计算
      totalCost: 0,   // 会在后面计算
      requestAt: new Date(Date.now() - i * 60000).toISOString(),
      createdAt: new Date(Date.now() - i * 60000 + 1000).toISOString(),
    })).map(stat => {
      stat.totalTokens = stat.inputTokens + stat.outputTokens
      stat.inputCost = stat.inputTokens * 0.00003  // 假设价格
      stat.outputCost = stat.outputTokens * 0.00006
      stat.totalCost = stat.inputCost + stat.outputCost
      return stat
    })
  }
}