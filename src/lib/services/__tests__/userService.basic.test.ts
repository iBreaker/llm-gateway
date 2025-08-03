/**
 * UserService 基础功能测试
 * 专注于核心业务逻辑验证
 */

// Mock nanoid to avoid ESM issues
jest.mock('nanoid', () => ({
  nanoid: jest.fn().mockReturnValue('mock-id'),
}))

// Mock dependencies first
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    apiKey: {
      count: jest.fn(),
    },
    usageRecord: {
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}))

import { UserService, ServiceError } from '../userService'
import { prisma } from '@/lib/prisma'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('UserService Basic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('ServiceError Integration', () => {
    it('should throw ServiceError with correct properties', async () => {
      try {
        await UserService.createUser({
          email: '',
          username: 'test',
          password: 'test123',
          role: 'USER',
        })
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceError)
        expect(error).toHaveProperty('message')
        expect(error).toHaveProperty('code')
        expect(error).toHaveProperty('statusCode')
      }
    })
  })

  describe('User Creation Validation', () => {
    it('should validate required fields', async () => {
      await expect(
        UserService.createUser({
          email: '',
          username: 'test',
          password: 'test123',
          role: 'USER',
        })
      ).rejects.toThrow('邮箱、用户名、密码和角色为必填项')
    })

    it('should validate email format', async () => {
      await expect(
        UserService.createUser({
          email: 'invalid-email',
          username: 'test',
          password: 'test123',
          role: 'USER',
        })
      ).rejects.toThrow('邮箱格式无效')
    })

    it('should validate password length', async () => {
      await expect(
        UserService.createUser({
          email: 'test@example.com',
          username: 'test',
          password: '123',
          role: 'USER',
        })
      ).rejects.toThrow('密码长度至少6位')
    })

    it('should validate role values', async () => {
      await expect(
        UserService.createUser({
          email: 'test@example.com',
          username: 'test',
          password: 'test123',
          role: 'INVALID' as any,
        })
      ).rejects.toThrow('角色必须是 USER 或 ADMIN')
    })
  })

  describe('Database Interaction', () => {
    it('should check email uniqueness', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: BigInt(1),
        email: 'test@example.com',
      } as any)

      await expect(
        UserService.createUser({
          email: 'test@example.com',
          username: 'test',
          password: 'test123',
          role: 'USER',
        })
      ).rejects.toThrow('邮箱已被使用')

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      })
    })

    it('should check username uniqueness', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: BigInt(1), username: 'test' } as any) // username check

      await expect(
        UserService.createUser({
          email: 'test@example.com',
          username: 'test',
          password: 'test123',
          role: 'USER',
        })
      ).rejects.toThrow('用户名已被使用')
    })

    it('should create user successfully', async () => {
      const mockUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'test',
        role: 'USER',
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.user.create.mockResolvedValue(mockUser as any)

      const result = await UserService.createUser({
        email: 'test@example.com',
        username: 'test',
        password: 'test123',
        role: 'USER',
      })

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        username: 'test',
        role: 'USER',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      })
    })
  })

  describe('User Retrieval', () => {
    it('should handle user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.getUserById(BigInt(999))).rejects.toThrow('用户不存在')
    })

    it('should return user data', async () => {
      const mockUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'test',
        role: 'USER',
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      const result = await UserService.getUserById(BigInt(1))

      expect(result.id).toBe('1')
      expect(result.email).toBe('test@example.com')
    })
  })

  describe('User Update', () => {
    it('should validate user exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(
        UserService.updateUser(BigInt(999), { username: 'new' })
      ).rejects.toThrow('用户不存在')
    })

    it('should update user successfully', async () => {
      const mockUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'test',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        username: 'updated',
      } as any)

      const result = await UserService.updateUser(BigInt(1), { username: 'updated' })

      expect(result.username).toBe('updated')
    })
  })

  describe('User Deletion', () => {
    it('should validate user exists before deletion', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.deleteUser(BigInt(999))).rejects.toThrow('用户不存在')
    })

    it('should delete user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: BigInt(1) } as any)
      mockPrisma.user.delete.mockResolvedValue({ id: BigInt(1) } as any)

      await UserService.deleteUser(BigInt(1))

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      })
    })
  })

  describe('User Statistics', () => {
    it('should return user statistics', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: BigInt(1) } as any)
      mockPrisma.apiKey.count.mockResolvedValue(3)
      mockPrisma.usageRecord.count.mockResolvedValue(100)
      mockPrisma.usageRecord.aggregate.mockResolvedValue({
        _sum: { cost: 50.5 },
      })

      const result = await UserService.getUserStats(BigInt(1))

      expect(result).toEqual({
        totalApiKeys: 3,
        totalRequests: 100,
        totalCost: 50.5,
      })
    })

    it('should handle user not found for statistics', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.getUserStats(BigInt(999))).rejects.toThrow('用户不存在')
    })
  })

  describe('Password Validation', () => {
    it('should validate correct password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: BigInt(1),
        passwordHash: 'hashed-password',
      } as any)

      const result = await UserService.validatePassword(BigInt(1), 'password123')

      expect(result).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const bcrypt = require('bcryptjs')
      bcrypt.compare.mockResolvedValue(false)

      mockPrisma.user.findUnique.mockResolvedValue({
        id: BigInt(1),
        passwordHash: 'hashed-password',
      } as any)

      const result = await UserService.validatePassword(BigInt(1), 'wrongpassword')

      expect(result).toBe(false)
    })

    it('should handle user not found for password validation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(
        UserService.validatePassword(BigInt(999), 'password123')
      ).rejects.toThrow('用户不存在')
    })
  })

  describe('Pagination Support', () => {
    it('should handle pagination parameters', async () => {
      mockPrisma.user.findMany.mockResolvedValue([])
      mockPrisma.user.count.mockResolvedValue(0)

      const result = await UserService.getUsers({ page: 1, pageSize: 10 })

      expect(result).toHaveProperty('data')
      expect(result).toHaveProperty('total')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('pageSize')
      expect(result).toHaveProperty('hasNext')

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by search term', async () => {
      mockPrisma.user.findMany.mockResolvedValue([])
      mockPrisma.user.count.mockResolvedValue(0)

      await UserService.getUsers({ search: 'test', page: 1, pageSize: 10 })

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { email: { contains: 'test', mode: 'insensitive' } },
            { username: { contains: 'test', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by role', async () => {
      mockPrisma.user.findMany.mockResolvedValue([])
      mockPrisma.user.count.mockResolvedValue(0)

      await UserService.getUsers({ role: 'ADMIN', page: 1, pageSize: 10 })

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter by active status', async () => {
      mockPrisma.user.findMany.mockResolvedValue([])
      mockPrisma.user.count.mockResolvedValue(0)

      await UserService.getUsers({ isActive: false, page: 1, pageSize: 10 })

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { isActive: false },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })
  })
})