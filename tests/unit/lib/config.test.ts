import { createSystemConfig, validateConfig, getConfigSummary } from '@/lib/config'
import { createTestDatabaseConfig } from '../../helpers/test-utils'

// Mock 环境变量
const mockEnv = (overrides: Record<string, string> = {}) => {
  const originalEnv = process.env
  
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      DATABASE_URL: './data/test.db',
      JWT_SECRET: 'test-jwt-secret-key-at-least-32-characters-long',
      ENCRYPTION_MASTER_KEY: 'test-encryption-key-at-least-32-characters-long',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      PORT: '3000',
      ...overrides
    }
  })
  
  afterEach(() => {
    process.env = originalEnv
  })
}

describe('系统配置', () => {
  describe('createSystemConfig', () => {
    describe('数据库配置', () => {
      mockEnv()

      test('应该默认使用 SQLite 配置', () => {
        const config = createSystemConfig()
        
        expect(config.database.type).toBe('sqlite')
        expect(config.database.url).toBe('./data/test.db')
        expect(config.database.options?.maxConnections).toBe(1)
      })

      test('检测到 PostgreSQL URL 时应该使用 PostgreSQL', () => {
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
        
        const config = createSystemConfig()
        
        expect(config.database.type).toBe('postgresql')
        expect(config.database.url).toBe('postgresql://user:pass@localhost:5432/db')
        expect(config.database.options?.maxConnections).toBe(5) // 测试环境
        expect(config.database.options?.ssl).toBe(false) // 非生产环境
      })

      test('生产环境应该启用 SSL', () => {
        process.env.NODE_ENV = 'production'
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'
        
        const config = createSystemConfig()
        
        expect(config.database.options?.ssl).toBe(true)
        expect(config.database.options?.maxConnections).toBe(10) // 生产环境
      })

      test('Vercel 环境应该配置 Blob 存储', () => {
        process.env.VERCEL = '1'
        
        const config = createSystemConfig()
        
        expect(config.database.type).toBe('sqlite')
        expect((config.database as any).blob?.enabled).toBe(true)
        expect((config.database as any).blob?.key).toBe('llmgw-database.db')
        expect((config.database as any).blob?.syncInterval).toBe(300)
        expect((config.database as any).blob?.backupCount).toBe(5)
      })
    })

    describe('缓存配置', () => {
      mockEnv()

      test('应该默认使用内存缓存', () => {
        const config = createSystemConfig()
        
        expect(config.cache.type).toBe('memory')
        expect(config.cache.url).toBeUndefined()
        expect(config.cache.options?.defaultTtl).toBe(3600)
        expect(config.cache.options?.keyPrefix).toBe('llmgw:')
      })

      test('配置 Redis URL 时应该使用 Redis', () => {
        process.env.REDIS_URL = 'redis://localhost:6379'
        
        const config = createSystemConfig()
        
        expect(config.cache.type).toBe('redis')
        expect(config.cache.url).toBe('redis://localhost:6379')
      })

      test('生产环境应该有更大的内存限制', () => {
        process.env.NODE_ENV = 'production'
        
        const config = createSystemConfig()
        
        expect(config.cache.options?.maxMemory).toBe(512 * 1024 * 1024) // 512MB
      })
    })

    describe('存储配置', () => {
      mockEnv()

      test('应该默认使用本地存储', () => {
        const config = createSystemConfig()
        
        expect(config.storage.type).toBe('local')
        expect((config.storage.options as any).rootPath).toBe('./data/storage')
        expect((config.storage.options as any).createDirectories).toBe(true)
      })

      test('配置 Blob Token 时应该使用 Vercel Blob', () => {
        process.env.BLOB_READ_WRITE_TOKEN = 'vercel-blob-token'
        
        const config = createSystemConfig()
        
        expect(config.storage.type).toBe('vercel-blob')
        expect((config.storage.options as any).token).toBe('vercel-blob-token')
        expect((config.storage.options as any).multipart).toBe(true)
      })
    })

    describe('服务器配置', () => {
      mockEnv()

      test('应该使用环境变量中的端口', () => {
        process.env.PORT = '8080'
        
        const config = createSystemConfig()
        
        expect(config.server.port).toBe(8080)
      })

      test('生产环境应该限制 CORS 来源', () => {
        process.env.NODE_ENV = 'production'
        process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
        
        const config = createSystemConfig()
        
        expect(config.server.cors.origin).toBe('https://example.com')
      })

      test('开发环境应该允许所有 CORS 来源', () => {
        process.env.NODE_ENV = 'development'
        
        const config = createSystemConfig()
        
        expect(config.server.cors.origin).toBe(true)
      })
    })

    describe('安全配置', () => {
      mockEnv()

      test('应该使用环境变量中的密钥', () => {
        const config = createSystemConfig()
        
        expect(config.security.jwtSecret).toBe('test-jwt-secret-key-at-least-32-characters-long')
        expect(config.security.encryptionKey).toBe('test-encryption-key-at-least-32-characters-long')
        expect(config.security.bcryptRounds).toBe(12)
      })
    })

    describe('功能配置', () => {
      mockEnv()

      test('开发环境应该禁用限流', () => {
        process.env.NODE_ENV = 'development'
        
        const config = createSystemConfig()
        
        expect(config.features.enableRateLimit).toBe(false)
      })

      test('生产环境应该启用限流', () => {
        process.env.NODE_ENV = 'production'
        
        const config = createSystemConfig()
        
        expect(config.features.enableRateLimit).toBe(true)
      })

      test('所有基础功能应该默认启用', () => {
        const config = createSystemConfig()
        
        expect(config.features.enableWebUI).toBe(true)
        expect(config.features.enableAPI).toBe(true)
        expect(config.features.enableMetrics).toBe(true)
      })
    })
  })

  describe('validateConfig', () => {
    mockEnv()

    test('有效配置应该通过验证', () => {
      const config = createSystemConfig()
      
      expect(() => validateConfig(config)).not.toThrow()
    })

    test('JWT Secret 太短应该抛出错误', () => {
      const config = createSystemConfig()
      config.security.jwtSecret = 'short'
      
      expect(() => validateConfig(config)).toThrow('JWT Secret 至少需要 32 个字符')
    })

    test('加密密钥太短应该抛出错误', () => {
      const config = createSystemConfig()
      config.security.encryptionKey = 'short'
      
      expect(() => validateConfig(config)).toThrow('加密密钥至少需要 32 个字符')
    })

    test('数据库 URL 为空应该抛出错误', () => {
      const config = createSystemConfig()
      config.database.url = ''
      
      expect(() => validateConfig(config)).toThrow('数据库 URL 不能为空')
    })

    test('Vercel Blob 缺少 token 应该抛出错误', () => {
      const config = createSystemConfig()
      config.storage = {
        type: 'vercel-blob',
        options: {} // 缺少 token
      }
      
      expect(() => validateConfig(config)).toThrow('Vercel Blob 存储需要配置 token')
    })

    test('配置验证通过应该输出日志', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const config = createSystemConfig()
      
      validateConfig(config)
      
      expect(consoleSpy).toHaveBeenCalledWith('✅ 系统配置验证通过')
      consoleSpy.mockRestore()
    })
  })

  describe('getConfigSummary', () => {
    mockEnv()

    test('应该返回配置摘要（不包含敏感信息）', () => {
      const config = createSystemConfig()
      const summary = getConfigSummary(config)
      
      expect(summary).toHaveProperty('database')
      expect(summary).toHaveProperty('cache')
      expect(summary).toHaveProperty('storage')
      expect(summary).toHaveProperty('server')
      expect(summary).toHaveProperty('features')
      expect(summary).toHaveProperty('environment')
      
      // 不应该包含敏感信息
      expect(JSON.stringify(summary)).not.toContain('jwt-secret')
      expect(JSON.stringify(summary)).not.toContain('encryption-key')
    })

    test('数据库 URL 应该被脱敏', () => {
      process.env.DATABASE_URL = 'postgresql://user:password@host:5432/database'
      const config = createSystemConfig()
      const summary = getConfigSummary(config)
      
      expect(summary.database.url).toBe('postgresql://***')
    })

    test('SQLite 文件路径应该被脱敏', () => {
      process.env.DATABASE_URL = './data/production.db'
      const config = createSystemConfig()
      const summary = getConfigSummary(config)
      
      expect(summary.database.url).toBe('./data/*****.db')
    })

    test('缓存配置应该只显示类型和是否有 URL', () => {
      process.env.REDIS_URL = 'redis://secret:password@host:6379'
      const config = createSystemConfig()
      const summary = getConfigSummary(config)
      
      expect(summary.cache).toEqual({
        type: 'redis',
        hasUrl: true
      })
    })

    test('存储配置应该只显示类型', () => {
      const config = createSystemConfig()
      const summary = getConfigSummary(config)
      
      expect(summary.storage).toEqual({
        type: 'local'
      })
    })

    test('应该包含环境信息', () => {
      process.env.NODE_ENV = 'production'
      const config = createSystemConfig()
      const summary = getConfigSummary(config)
      
      expect(summary.environment).toBe('production')
    })
  })

  describe('环境变量集成', () => {
    const originalEnv = process.env

    afterEach(() => {
      process.env = originalEnv
    })

    test('缺少必需环境变量时应该抛出错误', () => {
      process.env = {
        ...originalEnv,
        JWT_SECRET: undefined,
      }

      expect(() => createSystemConfig()).toThrow()
    })

    test('环境变量类型转换应该正确', () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        PORT: '8080',
        DATABASE_URL: './test.db',
        JWT_SECRET: 'test-jwt-secret-key-at-least-32-characters-long',
        ENCRYPTION_MASTER_KEY: 'test-encryption-key-at-least-32-characters-long',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }

      const config = createSystemConfig()
      
      expect(typeof config.server.port).toBe('number')
      expect(config.server.port).toBe(8080)
    })

    test('布尔环境变量应该正确转换', () => {
      process.env = {
        ...originalEnv,
        NODE_ENV: 'test',
        VERCEL: '1',
        DATABASE_URL: './test.db',
        JWT_SECRET: 'test-jwt-secret-key-at-least-32-characters-long',
        ENCRYPTION_MASTER_KEY: 'test-encryption-key-at-least-32-characters-long',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }

      const config = createSystemConfig()
      
      expect((config.database as any).blob?.enabled).toBe(true)
    })
  })
})