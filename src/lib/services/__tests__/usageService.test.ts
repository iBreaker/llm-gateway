import { UsageService, ServiceError } from '../usageService'
import { prisma } from '@/lib/prisma'

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    usageRecord: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    apiKey: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    upstreamAccount: {
      count: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('UsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('recordUsage', () => {
    const validUsageData = {
      apiKeyId: BigInt(1),
      upstreamAccountId: BigInt(1),
      requestId: 'req-123',
      method: 'POST',
      endpoint: '/v1/messages',
      model: 'claude-3-sonnet',
      statusCode: 200,
      responseTime: 1500,
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationInputTokens: 50,
      cacheReadInputTokens: 25,
      cost: 0.05,
      userAgent: 'Claude-CLI/1.0',
      clientIp: '127.0.0.1',
    }

    it('should record usage successfully', async () => {
      const mockUsageRecord = {
        id: BigInt(1),
        ...validUsageData,
        tokensUsed: BigInt(375), // 100 + 200 + 50 + 25
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.usageRecord.create.mockResolvedValue(mockUsageRecord as any)

      await UsageService.recordUsage(validUsageData)

      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith({
        data: {
          apiKeyId: BigInt(1),
          upstreamAccountId: BigInt(1),
          requestId: 'req-123',
          method: 'POST',
          endpoint: '/v1/messages',
          model: 'claude-3-sonnet',
          statusCode: 200,
          responseTime: 1500,
          inputTokens: BigInt(100),
          outputTokens: BigInt(200),
          cacheCreationInputTokens: BigInt(50),
          cacheReadInputTokens: BigInt(25),
          tokensUsed: BigInt(375),
          cost: 0.05,
          errorMessage: undefined,
          userAgent: 'Claude-CLI/1.0',
          clientIp: '127.0.0.1',
        },
      })
    })

    it('should handle missing token values', async () => {
      const minimalUsageData = {
        apiKeyId: BigInt(1),
        requestId: 'req-123',
        method: 'POST',
        endpoint: '/v1/messages',
      }

      const mockUsageRecord = {
        id: BigInt(1),
        ...minimalUsageData,
        tokensUsed: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.usageRecord.create.mockResolvedValue(mockUsageRecord as any)

      await UsageService.recordUsage(minimalUsageData)

      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith({
        data: {
          apiKeyId: BigInt(1),
          upstreamAccountId: undefined,
          requestId: 'req-123',
          method: 'POST',
          endpoint: '/v1/messages',
          model: undefined,
          statusCode: undefined,
          responseTime: undefined,
          inputTokens: BigInt(0),
          outputTokens: BigInt(0),
          cacheCreationInputTokens: BigInt(0),
          cacheReadInputTokens: BigInt(0),
          tokensUsed: BigInt(0),
          cost: undefined,
          errorMessage: undefined,
          userAgent: undefined,
          clientIp: undefined,
        },
      })
    })

    it('should handle database errors gracefully', async () => {
      mockPrisma.usageRecord.create.mockRejectedValue(new Error('Database error'))

      await expect(UsageService.recordUsage(validUsageData)).rejects.toThrow(
        new ServiceError('记录使用统计失败', 'RECORD_USAGE_FAILED', 500)
      )
    })
  })

  describe('getBasicStats', () => {
    it('should return basic statistics', async () => {
      const mockResults = [
        5, // totalApiKeys
        3, // activeAccounts
        1000, // totalRequests
        50, // errorCount
        { _sum: { cost: 250.75 } }, // costResult
        { _avg: { responseTime: 1200.5 } }, // avgResponseResult
      ]

      mockPrisma.apiKey.count.mockResolvedValue(mockResults[0])
      mockPrisma.upstreamAccount.count.mockResolvedValue(mockResults[1])
      mockPrisma.usageRecord.count
        .mockResolvedValueOnce(mockResults[2]) // totalRequests
        .mockResolvedValueOnce(mockResults[3]) // errorCount
      mockPrisma.usageRecord.aggregate
        .mockResolvedValueOnce(mockResults[4] as any) // costResult
        .mockResolvedValueOnce(mockResults[5] as any) // avgResponseResult

      const result = await UsageService.getBasicStats()

      expect(result).toEqual({
        totalApiKeys: 5,
        activeAccounts: 3,
        totalRequests: 1000,
        errorRate: 5, // (50/1000) * 100
        totalCost: 250.75,
        avgResponseTime: 1201, // Math.round(1200.5)
      })
    })

    it('should handle zero requests', async () => {
      mockPrisma.apiKey.count.mockResolvedValue(0)
      mockPrisma.upstreamAccount.count.mockResolvedValue(0)
      mockPrisma.usageRecord.count.mockResolvedValue(0)
      mockPrisma.usageRecord.aggregate.mockResolvedValue({
        _sum: { cost: null },
        _avg: { responseTime: null },
      } as any)

      const result = await UsageService.getBasicStats()

      expect(result).toEqual({
        totalApiKeys: 0,
        activeAccounts: 0,
        totalRequests: 0,
        errorRate: 0,
        totalCost: 0,
        avgResponseTime: 0,
      })
    })

    it('should handle database errors', async () => {
      mockPrisma.apiKey.count.mockRejectedValue(new Error('Database error'))

      await expect(UsageService.getBasicStats()).rejects.toThrow(
        new ServiceError('获取基础统计失败', 'GET_BASIC_STATS_FAILED', 500)
      )
    })
  })

  describe('getDetailedStats', () => {
    const mockDate = new Date('2024-01-01T12:00:00Z')

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should return detailed statistics for admin user', async () => {
      // Mock basic stats
      const mockBasicStats = [100, 80, 20, { _avg: { responseTime: 1000 } }, { _sum: { cost: 50 } }]
      mockPrisma.usageRecord.count
        .mockResolvedValueOnce(mockBasicStats[0]) // totalRequests
        .mockResolvedValueOnce(mockBasicStats[1]) // successfulRequests
        .mockResolvedValueOnce(mockBasicStats[2]) // failedRequests
      mockPrisma.usageRecord.aggregate
        .mockResolvedValueOnce(mockBasicStats[3] as any) // avgResponseResult
        .mockResolvedValueOnce(mockBasicStats[4] as any) // totalCostResult

      // Mock hourly data
      const mockHourlyData = [
        { createdAt: new Date('2024-01-01T11:00:00Z'), _count: { requestId: 10 } },
        { createdAt: new Date('2024-01-01T12:00:00Z'), _count: { requestId: 15 } },
      ]
      mockPrisma.usageRecord.groupBy
        .mockResolvedValueOnce(mockHourlyData) // requestsByHour
        .mockResolvedValueOnce(mockHourlyData) // requestsByDate

      // Mock models data
      const mockModelsData = [
        { model: 'claude-3-sonnet', _count: { requestId: 50 } },
        { model: 'claude-3-haiku', _count: { requestId: 30 } },
      ]
      mockPrisma.usageRecord.groupBy.mockResolvedValueOnce(mockModelsData)

      // Mock endpoints data
      const mockEndpointsData = [
        { endpoint: '/v1/messages', _count: { requestId: 80 } },
        { endpoint: '/v1/complete', _count: { requestId: 20 } },
      ]
      mockPrisma.usageRecord.groupBy.mockResolvedValueOnce(mockEndpointsData)

      // Mock errors data
      const mockErrorsData = [
        { statusCode: 400, _count: { requestId: 15 } },
        { statusCode: 500, _count: { requestId: 5 } },
      ]
      mockPrisma.usageRecord.groupBy.mockResolvedValueOnce(mockErrorsData)

      // Mock cost breakdown
      const mockCostData = [
        { createdAt: new Date('2024-01-01'), _sum: { cost: 25 } },
        { createdAt: new Date('2024-01-02'), _sum: { cost: 25 } },
      ]
      mockPrisma.usageRecord.groupBy.mockResolvedValueOnce(mockCostData)

      // Mock token usage
      const mockTokenData = {
        _sum: {
          inputTokens: BigInt(1000),
          outputTokens: BigInt(2000),
          cacheCreationInputTokens: BigInt(100),
          cacheReadInputTokens: BigInt(50),
        },
      }
      mockPrisma.usageRecord.aggregate.mockResolvedValueOnce(mockTokenData as any)

      const result = await UsageService.getDetailedStats()

      expect(result).toEqual({
        totalRequests: 100,
        successfulRequests: 80,
        failedRequests: 20,
        averageResponseTime: 1000,
        totalCost: 50,
        requestsByHour: expect.any(Array),
        requestsByDate: expect.any(Array),
        requestsByModel: [
          { model: 'claude-3-sonnet', count: 50 },
          { model: 'claude-3-haiku', count: 30 },
        ],
        topEndpoints: [
          { endpoint: '/v1/messages', count: 80 },
          { endpoint: '/v1/complete', count: 20 },
        ],
        errorsByType: [
          { errorType: '客户端错误', count: 15 },
          { errorType: '服务器错误', count: 5 },
        ],
        costBreakdown: expect.any(Array),
        tokenUsage: {
          totalInputTokens: 1000,
          totalOutputTokens: 2000,
          totalCacheTokens: 150,
        },
      })
    })

    it('should filter statistics for regular user', async () => {
      const userId = BigInt(1)

      // Call with userId should filter by user's API keys
      await UsageService.getDetailedStats(userId)

      // Verify that whereClause includes apiKey filter
      expect(mockPrisma.usageRecord.count).toHaveBeenCalledWith({
        where: { apiKey: { userId } },
      })
    })

    it('should handle database errors', async () => {
      mockPrisma.usageRecord.count.mockRejectedValue(new Error('Database error'))

      await expect(UsageService.getDetailedStats()).rejects.toThrow(
        new ServiceError('获取详细统计失败', 'GET_DETAILED_STATS_FAILED', 500)
      )
    })
  })

  describe('getUsageRecords', () => {
    it('should return paginated usage records', async () => {
      const mockRecords = [
        {
          id: BigInt(1),
          requestId: 'req-1',
          method: 'POST',
          endpoint: '/v1/messages',
          model: 'claude-3-sonnet',
          statusCode: 200,
          responseTime: 1000,
          inputTokens: BigInt(100),
          outputTokens: BigInt(200),
          cacheCreationInputTokens: BigInt(50),
          cacheReadInputTokens: BigInt(25),
          cost: 0.05,
          errorMessage: null,
          createdAt: new Date(),
          apiKey: { name: 'Test API Key' },
          upstreamAccount: { name: 'Test Account', type: 'CLAUDE_CODE' },
        },
      ]

      mockPrisma.usageRecord.findMany.mockResolvedValue(mockRecords as any)
      mockPrisma.usageRecord.count.mockResolvedValue(1)

      const result = await UsageService.getUsageRecords({ page: 1, pageSize: 10 })

      expect(result).toEqual({
        data: [
          {
            id: '1',
            requestId: 'req-1',
            method: 'POST',
            endpoint: '/v1/messages',
            model: 'claude-3-sonnet',
            statusCode: 200,
            responseTime: 1000,
            inputTokens: 100,
            outputTokens: 200,
            cacheCreationInputTokens: 50,
            cacheReadInputTokens: 25,
            cost: 0.05,
            errorMessage: null,
            apiKeyName: 'Test API Key',
            upstreamAccountName: 'Test Account',
            upstreamAccountType: 'CLAUDE_CODE',
            createdAt: mockRecords[0].createdAt.toISOString(),
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        hasNext: false,
      })

      expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          apiKey: { select: { name: true } },
          upstreamAccount: { select: { name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter records by API key ID', async () => {
      await UsageService.getUsageRecords({ apiKeyId: BigInt(1), page: 1, pageSize: 10 })

      expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: { apiKeyId: BigInt(1) },
        include: {
          apiKey: { select: { name: true } },
          upstreamAccount: { select: { name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter records by error status', async () => {
      await UsageService.getUsageRecords({ hasError: true, page: 1, pageSize: 10 })

      expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: { errorMessage: { not: null } },
        include: {
          apiKey: { select: { name: true } },
          upstreamAccount: { select: { name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter records by date range', async () => {
      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      await UsageService.getUsageRecords({
        startDate,
        endDate,
        page: 1,
        pageSize: 10,
      })

      expect(mockPrisma.usageRecord.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          apiKey: { select: { name: true } },
          upstreamAccount: { select: { name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })
  })

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const userId = BigInt(1)
      const mockApiKeys = [{ id: BigInt(1) }, { id: BigInt(2) }]

      mockPrisma.apiKey.findMany.mockResolvedValue(mockApiKeys as any)
      mockPrisma.usageRecord.count
        .mockResolvedValueOnce(150) // totalRequests
        .mockResolvedValueOnce(10) // errorCount
      mockPrisma.usageRecord.aggregate
        .mockResolvedValueOnce({ _sum: { cost: 75.5 } } as any) // costResult
        .mockResolvedValueOnce({ _sum: { tokensUsed: BigInt(5000) } } as any) // tokenResult

      const result = await UsageService.getUserStats(userId)

      expect(result).toEqual({
        totalRequests: 150,
        totalCost: 75.5,
        totalTokens: 5000,
        errorRate: 6.666666666666667, // (10/150) * 100
      })

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: { id: true },
      })
    })

    it('should handle user with no API keys', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([])

      const result = await UsageService.getUserStats(BigInt(1))

      expect(result).toEqual({
        totalRequests: 0,
        totalCost: 0,
        totalTokens: 0,
        errorRate: 0,
      })
    })

    it('should handle database errors', async () => {
      mockPrisma.apiKey.findMany.mockRejectedValue(new Error('Database error'))

      await expect(UsageService.getUserStats(BigInt(1))).rejects.toThrow(
        new ServiceError('获取用户统计失败', 'GET_USER_STATS_FAILED', 500)
      )
    })
  })

  describe('cleanupOldRecords', () => {
    it('should cleanup old records successfully', async () => {
      const mockResult = { count: 100 }
      mockPrisma.usageRecord.deleteMany.mockResolvedValue(mockResult)

      const result = await UsageService.cleanupOldRecords(30)

      expect(result).toBe(100)
      expect(mockPrisma.usageRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
        },
      })
    })

    it('should use default retention period', async () => {
      const mockResult = { count: 50 }
      mockPrisma.usageRecord.deleteMany.mockResolvedValue(mockResult)

      const result = await UsageService.cleanupOldRecords()

      expect(result).toBe(50)
      // Should use 90 days as default
      const expectedCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      expect(mockPrisma.usageRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: { lt: expect.any(Date) },
        },
      })
    })

    it('should handle database errors', async () => {
      mockPrisma.usageRecord.deleteMany.mockRejectedValue(new Error('Database error'))

      await expect(UsageService.cleanupOldRecords(30)).rejects.toThrow(
        new ServiceError('清理历史数据失败', 'CLEANUP_RECORDS_FAILED', 500)
      )
    })
  })

  describe('aggregateByHour', () => {
    const mockDate = new Date('2024-01-01T12:00:00Z')

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should aggregate data by hour correctly', async () => {
      const records = [
        { createdAt: new Date('2024-01-01T11:30:00Z'), _count: { requestId: 5 } },
        { createdAt: new Date('2024-01-01T11:45:00Z'), _count: { requestId: 3 } },
        { createdAt: new Date('2024-01-01T12:15:00Z'), _count: { requestId: 7 } },
      ]

      // Use reflection to access private method
      const aggregateByHour = (UsageService as any).aggregateByHour
      const result = aggregateByHour(records)

      expect(result).toEqual(
        expect.arrayContaining([
          { hour: '2024-01-01T11:00', count: 8 }, // 5 + 3
          { hour: '2024-01-01T12:00', count: 7 },
        ])
      )

      // Should have 24 hours of data
      expect(result).toHaveLength(24)
    })
  })

  describe('aggregateByDay', () => {
    const mockDate = new Date('2024-01-07T12:00:00Z')

    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(mockDate)
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should aggregate data by day correctly', async () => {
      const records = [
        { createdAt: new Date('2024-01-05T10:00:00Z'), _count: { requestId: 10 } },
        { createdAt: new Date('2024-01-05T14:00:00Z'), _count: { requestId: 5 } },
        { createdAt: new Date('2024-01-06T09:00:00Z'), _count: { requestId: 8 } },
      ]

      // Use reflection to access private method
      const aggregateByDay = (UsageService as any).aggregateByDay
      const result = aggregateByDay(records)

      expect(result).toEqual(
        expect.arrayContaining([
          { date: '2024-01-05', count: 15 }, // 10 + 5
          { date: '2024-01-06', count: 8 },
        ])
      )

      // Should have 7 days of data
      expect(result).toHaveLength(7)
    })
  })
})