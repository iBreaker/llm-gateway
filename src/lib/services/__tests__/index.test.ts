import { ServiceError } from '../index'

// Mock the entire services directory to avoid import issues
jest.mock('../userService', () => ({}))
jest.mock('../accountService', () => ({}))
jest.mock('../apiKeyService', () => ({}))
jest.mock('../usageService', () => ({}))

describe('ServiceError', () => {
  it('should create ServiceError with default values', () => {
    const error = new ServiceError('Test error message')

    expect(error.message).toBe('Test error message')
    expect(error.code).toBe('SERVICE_ERROR')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('ServiceError')
    expect(error).toBeInstanceOf(Error)
  })

  it('should create ServiceError with custom code', () => {
    const error = new ServiceError('Test error message', 'CUSTOM_ERROR')

    expect(error.message).toBe('Test error message')
    expect(error.code).toBe('CUSTOM_ERROR')
    expect(error.statusCode).toBe(400)
    expect(error.name).toBe('ServiceError')
  })

  it('should create ServiceError with custom code and status code', () => {
    const error = new ServiceError('Test error message', 'CUSTOM_ERROR', 404)

    expect(error.message).toBe('Test error message')
    expect(error.code).toBe('CUSTOM_ERROR')
    expect(error.statusCode).toBe(404)
    expect(error.name).toBe('ServiceError')
  })

  it('should inherit from Error class', () => {
    const error = new ServiceError('Test error message')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ServiceError)
  })

  it('should have proper stack trace', () => {
    const error = new ServiceError('Test error message')

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('ServiceError')
  })

  it('should be throwable and catchable', () => {
    const throwError = () => {
      throw new ServiceError('Test error message', 'TEST_ERROR', 500)
    }

    expect(throwError).toThrow(ServiceError)
    expect(throwError).toThrow('Test error message')

    try {
      throwError()
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError)
      if (error instanceof ServiceError) {
        expect(error.code).toBe('TEST_ERROR')
        expect(error.statusCode).toBe(500)
      }
    }
  })

  it('should be distinguishable from regular Error', () => {
    const serviceError = new ServiceError('Service error')
    const regularError = new Error('Regular error')

    expect(serviceError instanceof ServiceError).toBe(true)
    expect(serviceError instanceof Error).toBe(true)
    expect(regularError instanceof ServiceError).toBe(false)
    expect(regularError instanceof Error).toBe(true)
  })

  describe('Common error scenarios', () => {
    it('should create validation error', () => {
      const error = new ServiceError('邮箱格式无效', 'INVALID_EMAIL_FORMAT', 400)

      expect(error.message).toBe('邮箱格式无效')
      expect(error.code).toBe('INVALID_EMAIL_FORMAT')
      expect(error.statusCode).toBe(400)
    })

    it('should create not found error', () => {
      const error = new ServiceError('用户不存在', 'USER_NOT_FOUND', 404)

      expect(error.message).toBe('用户不存在')
      expect(error.code).toBe('USER_NOT_FOUND')
      expect(error.statusCode).toBe(404)
    })

    it('should create conflict error', () => {
      const error = new ServiceError('邮箱已被使用', 'EMAIL_ALREADY_EXISTS', 409)

      expect(error.message).toBe('邮箱已被使用')
      expect(error.code).toBe('EMAIL_ALREADY_EXISTS')
      expect(error.statusCode).toBe(409)
    })

    it('should create internal server error', () => {
      const error = new ServiceError('数据库连接失败', 'DATABASE_ERROR', 500)

      expect(error.message).toBe('数据库连接失败')
      expect(error.code).toBe('DATABASE_ERROR')
      expect(error.statusCode).toBe(500)
    })
  })
})