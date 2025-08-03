import { AccountService, ServiceError } from '../accountService'
import { prisma } from '@/lib/prisma'

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    upstreamAccount: {
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

// Mock encryption utilities
jest.mock('@/lib/auth', () => ({
  encryptCredentials: jest.fn().mockReturnValue('encrypted-credentials'),
  decryptCredentials: jest.fn().mockReturnValue({
    apiKey: 'decrypted-api-key',
    sessionKey: 'decrypted-session-key',
  }),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('AccountService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createAccount', () => {
    const validAccountData = {
      userId: BigInt(1),
      name: 'Test Account',
      type: 'CLAUDE_CODE' as const,
      credentials: {
        apiKey: 'test-api-key',
        sessionKey: 'test-session-key',
      },
      description: 'Test description',
    }

    it('should create account successfully', async () => {
      const mockUser = { id: BigInt(1), role: 'USER' }
      const mockAccount = {
        id: BigInt(1),
        userId: BigInt(1),
        name: 'Test Account',
        type: 'CLAUDE_CODE',
        encryptedCredentials: 'encrypted-credentials',
        status: 'ACTIVE',
        description: 'Test description',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastHealthCheck: null,
        healthStatus: null,
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      mockPrisma.upstreamAccount.create.mockResolvedValue(mockAccount as any)

      const result = await AccountService.createAccount(validAccountData)

      expect(result).toEqual({
        id: '1',
        userId: '1',
        name: 'Test Account',
        type: 'CLAUDE_CODE',
        status: 'ACTIVE',
        description: 'Test description',
        isActive: true,
        createdAt: mockAccount.createdAt.toISOString(),
        updatedAt: mockAccount.updatedAt.toISOString(),
        lastHealthCheck: null,
        healthStatus: null,
      })

      expect(mockPrisma.upstreamAccount.create).toHaveBeenCalledWith({
        data: {
          userId: BigInt(1),
          name: 'Test Account',
          type: 'CLAUDE_CODE',
          encryptedCredentials: 'encrypted-credentials',
          description: 'Test description',
          status: 'ACTIVE',
          isActive: true,
        },
      })
    })

    it('should throw error for missing required fields', async () => {
      const invalidData = {
        userId: BigInt(1),
        name: '',
        type: 'CLAUDE_CODE' as const,
        credentials: {},
      }

      await expect(AccountService.createAccount(invalidData)).rejects.toThrow(
        new ServiceError('名称、类型、用户ID和凭据为必填项', 'MISSING_REQUIRED_FIELDS', 400)
      )
    })

    it('should throw error for invalid account type', async () => {
      const invalidData = {
        ...validAccountData,
        type: 'INVALID_TYPE' as any,
      }

      await expect(AccountService.createAccount(invalidData)).rejects.toThrow(
        new ServiceError('不支持的账号类型', 'INVALID_ACCOUNT_TYPE', 400)
      )
    })

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(AccountService.createAccount(validAccountData)).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })

    it('should validate Claude Code credentials', async () => {
      const invalidData = {
        ...validAccountData,
        credentials: { apiKey: '' },
      }

      const mockUser = { id: BigInt(1), role: 'USER' }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      await expect(AccountService.createAccount(invalidData)).rejects.toThrow(
        new ServiceError('Claude Code 账号需要提供 API Key 和 Session Key', 'INVALID_CREDENTIALS', 400)
      )
    })

    it('should validate Gemini CLI credentials', async () => {
      const invalidData = {
        ...validAccountData,
        type: 'GEMINI_CLI' as const,
        credentials: { apiKey: '' },
      }

      const mockUser = { id: BigInt(1), role: 'USER' }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      await expect(AccountService.createAccount(invalidData)).rejects.toThrow(
        new ServiceError('Gemini CLI 账号需要提供 API Key', 'INVALID_CREDENTIALS', 400)
      )
    })
  })

  describe('getAccountById', () => {
    it('should return account when found', async () => {
      const mockAccount = {
        id: BigInt(1),
        userId: BigInt(1),
        name: 'Test Account',
        type: 'CLAUDE_CODE',
        encryptedCredentials: 'encrypted-credentials',
        status: 'ACTIVE',
        description: 'Test description',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastHealthCheck: null,
        healthStatus: null,
      }

      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)

      const result = await AccountService.getAccountById(BigInt(1))

      expect(result).toEqual({
        id: '1',
        userId: '1',
        name: 'Test Account',
        type: 'CLAUDE_CODE',
        status: 'ACTIVE',
        description: 'Test description',
        isActive: true,
        createdAt: mockAccount.createdAt.toISOString(),
        updatedAt: mockAccount.updatedAt.toISOString(),
        lastHealthCheck: null,
        healthStatus: null,
      })
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(AccountService.getAccountById(BigInt(999))).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })
  })

  describe('getAccounts', () => {
    it('should return paginated accounts list', async () => {
      const mockAccounts = [
        {
          id: BigInt(1),
          userId: BigInt(1),
          name: 'Account 1',
          type: 'CLAUDE_CODE',
          status: 'ACTIVE',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { username: 'user1' },
        },
        {
          id: BigInt(2),
          userId: BigInt(2),
          name: 'Account 2',
          type: 'GEMINI_CLI',
          status: 'INACTIVE',
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { username: 'user2' },
        },
      ]

      mockPrisma.upstreamAccount.findMany.mockResolvedValue(mockAccounts as any)
      mockPrisma.upstreamAccount.count.mockResolvedValue(2)

      const result = await AccountService.getAccounts({ page: 1, pageSize: 10 })

      expect(result.data).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.page).toBe(1)
      expect(result.pageSize).toBe(10)
      expect(result.hasNext).toBe(false)

      expect(mockPrisma.upstreamAccount.findMany).toHaveBeenCalledWith({
        where: {},
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by user ID', async () => {
      await AccountService.getAccounts({ userId: BigInt(1), page: 1, pageSize: 10 })

      expect(mockPrisma.upstreamAccount.findMany).toHaveBeenCalledWith({
        where: { userId: BigInt(1) },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by account type', async () => {
      await AccountService.getAccounts({ type: 'CLAUDE_CODE', page: 1, pageSize: 10 })

      expect(mockPrisma.upstreamAccount.findMany).toHaveBeenCalledWith({
        where: { type: 'CLAUDE_CODE' },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by status', async () => {
      await AccountService.getAccounts({ status: 'ACTIVE', page: 1, pageSize: 10 })

      expect(mockPrisma.upstreamAccount.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        include: { user: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should search by name', async () => {
      await AccountService.getAccounts({ search: 'test', page: 1, pageSize: 10 })

      expect(mockPrisma.upstreamAccount.findMany).toHaveBeenCalledWith({
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

  describe('updateAccount', () => {
    const mockAccount = {
      id: BigInt(1),
      userId: BigInt(1),
      name: 'Test Account',
      type: 'CLAUDE_CODE',
      encryptedCredentials: 'encrypted-credentials',
      status: 'ACTIVE',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should update account successfully', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.upstreamAccount.update.mockResolvedValue({
        ...mockAccount,
        name: 'Updated Account',
      } as any)

      const result = await AccountService.updateAccount(BigInt(1), {
        name: 'Updated Account',
      })

      expect(result.name).toBe('Updated Account')
      expect(mockPrisma.upstreamAccount.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { name: 'Updated Account' },
      })
    })

    it('should update credentials when provided', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.upstreamAccount.update.mockResolvedValue(mockAccount as any)

      await AccountService.updateAccount(BigInt(1), {
        credentials: {
          apiKey: 'new-api-key',
          sessionKey: 'new-session-key',
        },
      })

      expect(mockPrisma.upstreamAccount.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { encryptedCredentials: 'encrypted-credentials' },
      })
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(
        AccountService.updateAccount(BigInt(999), { name: 'New Name' })
      ).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })

    it('should validate credentials for Claude Code accounts', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)

      await expect(
        AccountService.updateAccount(BigInt(1), {
          credentials: { apiKey: '' },
        })
      ).rejects.toThrow(
        new ServiceError('Claude Code 账号需要提供 API Key 和 Session Key', 'INVALID_CREDENTIALS', 400)
      )
    })
  })

  describe('deleteAccount', () => {
    it('should delete account successfully', async () => {
      const mockAccount = { id: BigInt(1) }
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.upstreamAccount.delete.mockResolvedValue(mockAccount as any)

      await AccountService.deleteAccount(BigInt(1))

      expect(mockPrisma.upstreamAccount.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      })
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(AccountService.deleteAccount(BigInt(999))).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })
  })

  describe('toggleAccountStatus', () => {
    it('should toggle active account to inactive', async () => {
      const mockAccount = {
        id: BigInt(1),
        isActive: true,
        status: 'ACTIVE',
      }

      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.upstreamAccount.update.mockResolvedValue({
        ...mockAccount,
        isActive: false,
        status: 'INACTIVE',
      } as any)

      const result = await AccountService.toggleAccountStatus(BigInt(1))

      expect(result.isActive).toBe(false)
      expect(result.status).toBe('INACTIVE')
      expect(mockPrisma.upstreamAccount.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: {
          isActive: false,
          status: 'INACTIVE',
        },
      })
    })

    it('should toggle inactive account to active', async () => {
      const mockAccount = {
        id: BigInt(1),
        isActive: false,
        status: 'INACTIVE',
      }

      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.upstreamAccount.update.mockResolvedValue({
        ...mockAccount,
        isActive: true,
        status: 'ACTIVE',
      } as any)

      const result = await AccountService.toggleAccountStatus(BigInt(1))

      expect(result.isActive).toBe(true)
      expect(result.status).toBe('ACTIVE')
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(AccountService.toggleAccountStatus(BigInt(999))).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })
  })

  describe('getAccountCredentials', () => {
    it('should return decrypted credentials', async () => {
      const mockAccount = {
        id: BigInt(1),
        encryptedCredentials: 'encrypted-credentials',
      }

      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)

      const result = await AccountService.getAccountCredentials(BigInt(1))

      expect(result).toEqual({
        apiKey: 'decrypted-api-key',
        sessionKey: 'decrypted-session-key',
      })
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(AccountService.getAccountCredentials(BigInt(999))).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })
  })

  describe('performHealthCheck', () => {
    it('should update health status on successful check', async () => {
      const mockAccount = {
        id: BigInt(1),
        type: 'CLAUDE_CODE',
        encryptedCredentials: 'encrypted-credentials',
      }

      // Mock successful health check
      jest.doMock('@/lib/anthropic/client', () => ({
        testClaudeCodeConnection: jest.fn().mockResolvedValue({ success: true }),
      }))

      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.upstreamAccount.update.mockResolvedValue({
        ...mockAccount,
        healthStatus: 'HEALTHY',
        lastHealthCheck: new Date(),
      } as any)

      const result = await AccountService.performHealthCheck(BigInt(1))

      expect(result.healthStatus).toBe('HEALTHY')
      expect(mockPrisma.upstreamAccount.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: {
          healthStatus: 'HEALTHY',
          lastHealthCheck: expect.any(Date),
        },
      })
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(AccountService.performHealthCheck(BigInt(999))).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })
  })

  describe('getAccountStats', () => {
    it('should return account statistics', async () => {
      const mockAccount = { id: BigInt(1) }
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(mockAccount as any)
      mockPrisma.usageRecord.count.mockResolvedValue(200)
      mockPrisma.usageRecord.aggregate.mockResolvedValue({
        _sum: { cost: 100.75 },
      })

      const result = await AccountService.getAccountStats(BigInt(1))

      expect(result).toEqual({
        totalRequests: 200,
        totalCost: 100.75,
      })
    })

    it('should throw error when account not found', async () => {
      mockPrisma.upstreamAccount.findUnique.mockResolvedValue(null)

      await expect(AccountService.getAccountStats(BigInt(999))).rejects.toThrow(
        new ServiceError('上游账号不存在', 'ACCOUNT_NOT_FOUND', 404)
      )
    })
  })
})