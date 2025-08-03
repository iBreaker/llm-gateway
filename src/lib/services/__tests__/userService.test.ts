import { UserService, ServiceError } from '../userService'
import { prisma } from '@/lib/prisma'

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

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createUser', () => {
    const validUserData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
      role: 'USER' as const,
    }

    it('should create a user successfully', async () => {
      const mockUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.user.findUnique.mockResolvedValue(null) // 用户不存在
      mockPrisma.user.create.mockResolvedValue(mockUser)

      const result = await UserService.createUser(validUserData)

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: mockUser.createdAt.toISOString(),
        updatedAt: mockUser.updatedAt.toISOString(),
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

    it('should throw error for missing required fields', async () => {
      const invalidData = {
        email: '',
        username: 'testuser',
        password: 'password123',
        role: 'USER' as const,
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        new ServiceError('邮箱、用户名、密码和角色为必填项', 'MISSING_REQUIRED_FIELDS', 400)
      )
    })

    it('should throw error for invalid email format', async () => {
      const invalidData = {
        ...validUserData,
        email: 'invalid-email',
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        new ServiceError('邮箱格式无效', 'INVALID_EMAIL_FORMAT', 400)
      )
    })

    it('should throw error for short password', async () => {
      const invalidData = {
        ...validUserData,
        password: '123',
      }

      await expect(UserService.createUser(invalidData)).rejects.toThrow(
        new ServiceError('密码长度至少6位', 'PASSWORD_TOO_SHORT', 400)
      )
    })

    it('should throw error for duplicate email', async () => {
      const existingUser = { id: BigInt(1), email: 'test@example.com' }
      mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser as any)

      await expect(UserService.createUser(validUserData)).rejects.toThrow(
        new ServiceError('邮箱已被使用', 'EMAIL_ALREADY_EXISTS', 409)
      )
    })

    it('should throw error for duplicate username', async () => {
      const existingUser = { id: BigInt(1), username: 'testuser' }
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // 邮箱检查
        .mockResolvedValueOnce(existingUser as any) // 用户名检查

      await expect(UserService.createUser(validUserData)).rejects.toThrow(
        new ServiceError('用户名已被使用', 'USERNAME_ALREADY_EXISTS', 409)
      )
    })
  })

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: BigInt(1),
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.user.findUnique.mockResolvedValue(mockUser)

      const result = await UserService.getUserById(BigInt(1))

      expect(result).toEqual({
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'USER',
        isActive: true,
        createdAt: mockUser.createdAt.toISOString(),
        updatedAt: mockUser.updatedAt.toISOString(),
      })

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      })
    })

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.getUserById(BigInt(999))).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })
  })

  describe('getUsers', () => {
    it('should return paginated users list', async () => {
      const mockUsers = [
        {
          id: BigInt(1),
          email: 'user1@example.com',
          username: 'user1',
          role: 'USER',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: BigInt(2),
          email: 'user2@example.com',
          username: 'user2',
          role: 'ADMIN',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      mockPrisma.user.findMany.mockResolvedValue(mockUsers)
      mockPrisma.user.count.mockResolvedValue(2)

      const result = await UserService.getUsers({ page: 1, pageSize: 10 })

      expect(result).toEqual({
        data: mockUsers.map(user => ({
          id: user.id.toString(),
          email: user.email,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        })),
        total: 2,
        page: 1,
        pageSize: 10,
        hasNext: false,
      })

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter users by search term', async () => {
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

    it('should filter users by role', async () => {
      await UserService.getUsers({ role: 'ADMIN', page: 1, pageSize: 10 })

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { role: 'ADMIN' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })

    it('should filter users by active status', async () => {
      await UserService.getUsers({ isActive: false, page: 1, pageSize: 10 })

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { isActive: false },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      })
    })
  })

  describe('updateUser', () => {
    const mockUser = {
      id: BigInt(1),
      email: 'test@example.com',
      username: 'testuser',
      role: 'USER',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should update user successfully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser)
      mockPrisma.user.update.mockResolvedValue({
        ...mockUser,
        username: 'newusername',
      })

      const result = await UserService.updateUser(BigInt(1), {
        username: 'newusername',
      })

      expect(result.username).toBe('newusername')
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { username: 'newusername' },
      })
    })

    it('should update password when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser)
      mockPrisma.user.update.mockResolvedValue(mockUser)

      await UserService.updateUser(BigInt(1), { password: 'newpassword123' })

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        data: { passwordHash: 'hashed-password' },
      })
    })

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(
        UserService.updateUser(BigInt(999), { username: 'newname' })
      ).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })

    it('should throw error for invalid email format', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser)

      await expect(
        UserService.updateUser(BigInt(1), { email: 'invalid-email' })
      ).rejects.toThrow(
        new ServiceError('邮箱格式无效', 'INVALID_EMAIL_FORMAT', 400)
      )
    })

    it('should throw error for short password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser)

      await expect(
        UserService.updateUser(BigInt(1), { password: '123' })
      ).rejects.toThrow(
        new ServiceError('密码长度至少6位', 'PASSWORD_TOO_SHORT', 400)
      )
    })
  })

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const mockUser = { id: BigInt(1) }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
      mockPrisma.user.delete.mockResolvedValue(mockUser as any)

      await UserService.deleteUser(BigInt(1))

      expect(mockPrisma.user.delete).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
      })
    })

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.deleteUser(BigInt(999))).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })
  })

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockUser = { id: BigInt(1) }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)
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

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(UserService.getUserStats(BigInt(999))).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })
  })

  describe('validatePassword', () => {
    it('should return true for valid password', async () => {
      const mockUser = {
        id: BigInt(1),
        passwordHash: 'hashed-password',
      }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      const result = await UserService.validatePassword(BigInt(1), 'password123')

      expect(result).toBe(true)
    })

    it('should return false for invalid password', async () => {
      const bcrypt = require('bcryptjs')
      bcrypt.compare.mockResolvedValue(false)

      const mockUser = {
        id: BigInt(1),
        passwordHash: 'hashed-password',
      }
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any)

      const result = await UserService.validatePassword(BigInt(1), 'wrongpassword')

      expect(result).toBe(false)
    })

    it('should throw error when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      await expect(
        UserService.validatePassword(BigInt(999), 'password123')
      ).rejects.toThrow(
        new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)
      )
    })
  })
})