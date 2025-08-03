import { ApiKeyService, ServiceError } from '../apiKeyService'
import { prisma } from '@/lib/prisma'
import { createHash } from 'crypto'

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    usageRecord: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

// Mock crypto
jest.mock('crypto', () => ({
  createHash: jest.fn(),
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('random-key'),
  }),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCreateHash = createHash as jest.MockedFunction<typeof createHash>

describe('ApiKeyService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock hash function
    const mockHashInstance = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('hashed-key'),
    }
    mockCreateHash.mockReturnValue(mockHashInstance as any)
  })

  describe('createApiKey', () => {
    const validKeyData = {
      userId: BigInt(1),
      name: 'Test API Key',
      permissions: ['READ'] as const,
      rateLimit: 100,
    }

    it('should create API key successfully', async () => {
      const mockUser = { id: BigInt(1), role: 'USER' }
      const mockApiKey = {
        id: BigInt(1),
        userId: BigInt(1),
        name: 'Test API Key',
        keyHash: 'hashed-key',
        permissions: ['READ'],
        rateLimit: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      mockPrisma.apiKey.create.mockResolvedValue(mockApiKey as any)

      const result = await ApiKeyService.createApiKey(validKeyData)

      expect(result).toEqual({
        id: '1',
        userId: '1',
        name: 'Test API Key',
        key: 'llm_random-key',
        permissions: ['READ'],
        rateLimit: 100,
        isActive: true,
        createdAt: mockApiKey.createdAt.toISOString(),
        updatedAt: mockApiKey.updatedAt.toISOString(),
        lastUsedAt: null,
      })

      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          userId: BigInt(1),
          name: 'Test API Key',
          keyHash: 'hashed-key',
          permissions: ['READ'],
          rateLimit: 100,
          isActive: true,
        },
      })
    })

    it('should throw error for missing required fields', async () => {
      const invalidData = {
        userId: BigInt(1),
        name: '',
        permissions: ['READ'] as const,
      }

      await expect(ApiKeyService.createApiKey(invalidData)).rejects.toThrow(
        new ServiceError('名称、用户ID和权限为必填项', 'MISSING_REQUIRED_FIELDS', 400)
      )
    })

    it('should throw error for invalid permissions', async () => {
      const invalidData = {
        ...validKeyData,
        permissions: [] as any,
      }

      await expect(ApiKeyService.createApiKey(invalidData)).rejects.toThrow(
        new ServiceError('至少需要指定一个权限', 'INVALID_PERMISSIONS', 400)
      )
    })

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(ApiKeyService.createApiKey(validKeyData)).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })

    it('should throw error for invalid rate limit', async () => {
      const invalidData = {
        ...validKeyData,
        rateLimit: -1,
      }

      const mockUser = { id: BigInt(1), role: 'USER' }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      await expect(ApiKeyService.createApiKey(invalidData)).rejects.toThrow(
        new ServiceError('限流值必须大于0', 'INVALID_RATE_LIMIT', 400)
      )
    })
  })

  describe('getApiKeyById', () => {
    it('should return API key when found', async () => {
      const mockApiKey = {
        id: BigInt(1),
        userId: BigInt(1),
        name: 'Test API Key',
        keyHash: 'hashed-key',
        permissions: ['READ'],
        rateLimit: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      }

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)

      const result = await ApiKeyService.getApiKeyById(BigInt(1))

      expect(result).toEqual({
        id: '1',
        userId: '1',
        name: 'Test API Key',
        permissions: ['READ'],
        rateLimit: 100,
        isActive: true,
        createdAt: mockApiKey.createdAt.toISOString(),
        updatedAt: mockApiKey.updatedAt.toISOString(),
        lastUsedAt: null,
      })
    })

    it('should throw error when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null)

      await expect(ApiKeyService.getApiKeyById(BigInt(999))).rejects.toThrow(
        new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404)
      )
    })
  })

  describe('getApiKeys', () => {
    it('should return paginated API keys list', async () => {
      const mockApiKeys = [
        {
          id: BigInt(1),
          userId: BigInt(1),
          name: 'API Key 1',
          keyHash: 'hash1',
          permissions: ['READ'],
          rateLimit: 100,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
          user: { username: 'user1' },
        },
        {
          id: BigInt(2),
          userId: BigInt(2),
          name: 'API Key 2',
          keyHash: 'hash2',
          permissions: ['READ', 'WRITE'],
          rateLimit: 200,
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: new Date(),
          user: { username: 'user2' },
        },
      ]

      mockPrisma.apiKey.findMany.mockResolvedValue(mockApiKeys as any)
      mockPrisma.apiKey.count.mockResolvedValue(2)

      const result = await ApiKeyService.getApiKeys({ page: 1, pageSize: 10 })

      expect(result.data).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.hasNext).toBe(false)

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: {},
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by user ID', async () => {
      await ApiKeyService.getApiKeys({ userId: BigInt(1), page: 1, pageSize: 10 })

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: BigInt(1) },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by active status', async () => {
      await ApiKeyService.getApiKeys({ isActive: false, page: 1, pageSize: 10 })

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { isActive: false },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should search by name', async () => {
      await ApiKeyService.getApiKeys({ search: 'test', page: 1, pageSize: 10 })

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: {
          name: { contains: 'test', mode: 'insensitive' },
        },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })
  })

  describe('updateApiKey', () => {
    const mockApiKey = {
      id: BigInt(1),
      userId: BigInt(1),
      name: 'Test API Key',
      keyHash: 'hashed-key',
      permissions: ['READ'],
      rateLimit: 100,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
    }

    it('should update API key successfully', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)
      mockPrisma.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        name: 'Updated API Key',
      } as any)

      const result = await ApiKeyService.updateApiKey(BigInt(1), {
        name: 'Updated API Key',
      })

      expect(result.name).toBe('Updated API Key')
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { name: 'Updated API Key' },
      })
    })

    it('should throw error when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null)

      await expect(
        ApiKeyService.updateApiKey(BigInt(999), { name: 'New Name' })
      ).rejects.toThrow(
        new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404)
      )
    })

    it('should throw error for invalid rate limit', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)

      await expect(
        ApiKeyService.updateApiKey(BigInt(1), { rateLimit: -1 })
      ).rejects.toThrow(
        new ServiceError('限流值必须大于0', 'INVALID_RATE_LIMIT', 400)
      )
    })

    it('should throw error for empty permissions', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)

      await expect(
        ApiKeyService.updateApiKey(BigInt(1), { permissions: [] })
      ).rejects.toThrow(
        new ServiceError('至少需要指定一个权限', 'INVALID_PERMISSIONS', 400)
      )
    })
  })

  describe('deleteApiKey', () => {
    it('should delete API key successfully', async () => {
      const mockApiKey = { id: BigInt(1) }
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)
      mockPrisma.apiKey.delete.mockResolvedValue(mockApiKey as any)

      await ApiKeyService.deleteApiKey(BigInt(1))

      expect(mockPrisma.apiKey.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      })
    })

    it('should throw error when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null)

      await expect(ApiKeyService.deleteApiKey(BigInt(999))).rejects.toThrow(
        new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404)
      )
    })
  })

  describe('validateApiKey', () => {
    it('should return API key info for valid key', async () => {
      const mockApiKey = {
        id: BigInt(1),
        userId: BigInt(1),
        name: 'Test API Key',
        keyHash: 'hashed-key',
        permissions: ['READ'],
        rateLimit: 100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
        user: { id: BigInt(1), role: 'USER' },
      }

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)

      const result = await ApiKeyService.validateApiKey('llm_random-key')

      expect(result).toEqual({
        id: '1',
        userId: '1',
        name: 'Test API Key',
        permissions: ['READ'],
        rateLimit: 100,
        user: {
          id: '1',
          role: 'USER',
        },
      })

      expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
        where: { keyHash: 'hashed-key' },
        include: { user: { select: { id: true, role: true } } },
      })
    })

    it('should return null for invalid key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null)

      const result = await ApiKeyService.validateApiKey('invalid-key')

      expect(result).toBeNull()
    })

    it('should return null for inactive key', async () => {
      const mockApiKey = {
        id: BigInt(1),
        isActive: false,
      }

      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)

      const result = await ApiKeyService.validateApiKey('llm_random-key')

      expect(result).toBeNull()
    })
  })

  describe('updateLastUsed', () => {
    it('should update last used timestamp', async () => {
      const mockApiKey = { id: BigInt(1) }
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)
      mockPrisma.apiKey.update.mockResolvedValue(mockApiKey as any)

      await ApiKeyService.updateLastUsed(BigInt(1))

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { lastUsedAt: expect.any(Date) },
      })
    })

    it('should throw error when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null)

      await expect(ApiKeyService.updateLastUsed(BigInt(999))).rejects.toThrow(
        new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404)
      )
    })
  })

  describe('getApiKeyStats', () => {
    it('should return API key statistics', async () => {
      const mockApiKey = { id: BigInt(1) }
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as any)
      mockPrisma.usageRecord.count.mockResolvedValue(150)
      mockPrisma.usageRecord.aggregate.mockResolvedValue({
        _sum: { cost: 75.25 },
      })

      const result = await ApiKeyService.getApiKeyStats(BigInt(1))

      expect(result).toEqual({
        totalRequests: 150,
        totalCost: 75.25,
      })
    })

    it('should throw error when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null)

      await expect(ApiKeyService.getApiKeyStats(BigInt(999))).rejects.toThrow(
        new ServiceError('API密钥不存在', 'API_KEY_NOT_FOUND', 404)
      )
    })
  })
})