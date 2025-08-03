/**
 * 简化版 UserService 测试
 * 重点测试业务逻辑，避免复杂的依赖问题
 */

// Mock Prisma client
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

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true),
}))

import { UserService, ServiceError } from '../userService'
import { prisma } from '@/lib/prisma'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('UserService - Core Logic Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Input Validation', () => {
    it('should validate required fields for user creation', async () => {
      const invalidData = {
        email: '',
        username: 'testuser',
        password: 'password123',
        role: 'USER' as const,
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        expect.objectContaining({
          message: '邮箱、用户名、密码和角色为必填项',
          code: 'MISSING_REQUIRED_FIELDS',
          statusCode: 400,
        })
      )
    })

    it('should validate email format', async () => {
      const invalidData = {
        email: 'invalid-email',
        username: 'testuser',
        password: 'password123',
        role: 'USER' as const,
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        expect.objectContaining({
          message: '邮箱格式无效',
          code: 'INVALID_EMAIL_FORMAT',
          statusCode: 400,
        })
      )
    })

    it('should validate password length', async () => {
      const invalidData = {
        email: 'test@example.com',
        username: 'testuser',
        password: '123',
        role: 'USER' as const,
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        expect.objectContaining({
          message: '密码长度至少6位',
          code: 'PASSWORD_TOO_SHORT',
          statusCode: 400,
        })
      )
    })

    it('should validate role values', async () => {
      const invalidData = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
        role: 'INVALID_ROLE' as any,
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        expect.objectContaining({
          message: '角色必须是 USER 或 ADMIN',
          code: 'INVALID_ROLE',
          statusCode: 400,
        })
      )
    })
  })

  describe('User Creation Flow', () => {
    const validUserData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      role: 'USER' as const,
    }

    it('should check for email uniqueness', async () => {
      const existingUser = { id: BigInt(1), email: 'test@example.com' }
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser as any)

      await expect(UserService.createUser(validUserData)).rejects.toThrow(
        expect.objectContaining({
          message: '邮箱已被使用',
          code: 'EMAIL_ALREADY_EXISTS',
          statusCode: 409,
        })
      )

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      })
    })

    it('should check for username uniqueness', async () => {
      const existingUser = { id: BigInt(1), username: 'testuser' }
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(existingUser as any) // username check

      await expect(UserService.createUser(validUserData)).rejects.toThrow(
        expect.objectContaining({
          message: '用户名已被使用',
          code: 'USERNAME_ALREADY_EXISTS',
          statusCode: 409,
        })
      )

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      })
    })

    it('should create user with valid data', async () => {
      const mockCreatedUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      mockPrisma.user.findUnique.mockResolvedValue(null) // no existing user
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser as any)

      const result = await UserService.createUser(validUserData)

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      })

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          username: 'testuser',
          passwordHash: 'hashed-password',
          role: 'USER',
          isActive: true,
        },
      })
    })
  })

  describe('User Retrieval', () => {
    it('should handle user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.getUserById(BigInt(999))).rejects.toThrow(
        expect.objectContaining({
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        })
      )
    })

    it('should return formatted user data', async () => {
      const mockUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      const result = await UserService.getUserById(BigInt(1))

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      })
    })
  })

  describe('User Update', () => {
    const mockUser = {
      id: BigInt(1),
      email: 'test@example.com',
      username: 'testuser',
      role: 'USER',
      isActive: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    }

    it('should validate user exists before update', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)

      await expect(
        UserService.updateUser(BigInt(999), { username: 'newname' })
      ).rejects.toThrow(
        expect.objectContaining({
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        })
      )
    })

    it('should validate email format on update', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)

      await expect(
        UserService.updateUser(BigInt(1), { email: 'invalid-email' })
      ).rejects.toThrow(
        expect.objectContaining({
          message: '邮箱格式无效',
          code: 'INVALID_EMAIL_FORMAT',
          statusCode: 400,
        })
      )
    })

    it('should validate password length on update', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)

      await expect(
        UserService.updateUser(BigInt(1), { password: '123' })
      ).rejects.toThrow(
        expect.objectContaining({
          message: '密码长度至少6位',
          code: 'PASSWORD_TOO_SHORT',
          statusCode: 400,
        })
      )
    })

    it('should update user successfully', async () => {
      const updatedUser = { ...mockUser, username: 'newusername' }
      
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)
      mockPrismaUser.update.mockResolvedValue(updatedUser)

      const result = await UserService.updateUser(BigInt(1), {
        username: 'newusername',
      })

      expect(result.username).toBe('newusername')
      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { username: 'newusername' },
      })
    })
  })

  describe('User Deletion', () => {
    it('should validate user exists before deletion', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)

      await expect(UserService.deleteUser(BigInt(999))).rejects.toThrow(
        expect.objectContaining({
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        })
      )
    })

    it('should delete user successfully', async () => {
      const mockUser = { id: BigInt(1) }
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)
      mockPrismaUser.delete.mockResolvedValue(mockUser)

      await UserService.deleteUser(BigInt(1))

      expect(mockPrismaUser.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      })
    })
  })

  describe('User Statistics', () => {
    it('should calculate user statistics', async () => {
      const mockUser = { id: BigInt(1) }
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)
      mockPrismaApiKey.count.mockResolvedValue(3)
      mockPrismaUsageRecord.count.mockResolvedValue(100)
      mockPrismaUsageRecord.aggregate.mockResolvedValue({
        _sum: { cost: 50.5 },
      })

      const result = await UserService.getUserStats(BigInt(1))

      expect(result).toEqual({
        totalApiKeys: 3,
        totalRequests: 100,
        totalCost: 50.5,
      })

      expect(mockPrismaApiKey.count).toHaveBeenCalledWith({
        where: { userId: BigInt(1) },
      })
    })

    it('should handle user not found for statistics', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)

      await expect(UserService.getUserStats(BigInt(999))).rejects.toThrow(
        expect.objectContaining({
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        })
      )
    })
  })

  describe('Password Validation', () => {
    it('should validate correct password', async () => {
      const mockUser = {
        id: BigInt(1),
        passwordHash: 'hashed-password',
      }
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)

      const result = await UserService.validatePassword(BigInt(1), 'password123')

      expect(result).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const bcrypt = require('bcryptjs')
      bcrypt.compare.mockResolvedValue(false)

      const mockUser = {
        id: BigInt(1),
        passwordHash: 'hashed-password',
      }
      mockPrismaUser.findUnique.mockResolvedValue(mockUser)

      const result = await UserService.validatePassword(BigInt(1), 'wrongpassword')

      expect(result).toBe(false)
    })

    it('should handle user not found for password validation', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null)

      await expect(
        UserService.validatePassword(BigInt(999), 'password123')
      ).rejects.toThrow(
        expect.objectContaining({
          message: '用户不存在',
          code: 'USER_NOT_FOUND',
          statusCode: 404,
        })
      )
    })
  })
})