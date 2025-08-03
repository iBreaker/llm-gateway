/**
 * 基础测试
 * 验证测试框架正常工作
 */

describe('Basic Tests', () => {
  it('should pass basic mathematical operations', () => {
    expect(1 + 1).toBe(2)
    expect(2 * 3).toBe(6)
    expect(10 / 2).toBe(5)
  })

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test-success')
    expect(result).toBe('test-success')
  })

  it('should handle arrays', () => {
    const arr = [1, 2, 3]
    expect(arr).toHaveLength(3)
    expect(arr).toContain(2)
  })

  it('should handle objects', () => {
    const obj = { name: 'test', value: 42 }
    expect(obj).toHaveProperty('name')
    expect(obj.value).toBe(42)
  })
})

describe('Error Handling', () => {
  it('should create basic Error objects', () => {
    const error = new Error('Test error')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Test error')
  })

  it('should handle custom error classes', () => {
    class CustomError extends Error {
      constructor(message: string, public code: string) {
        super(message)
        this.name = 'CustomError'
      }
    }

    const error = new CustomError('Custom error message', 'CUSTOM_CODE')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(CustomError)
    expect(error.message).toBe('Custom error message')
    expect(error.code).toBe('CUSTOM_CODE')
    expect(error.name).toBe('CustomError')
  })
})