/**
 * 输入验证工具
 * 加强API输入验证和数据清理
 */

import { z } from 'zod'

/**
 * 通用验证规则
 */
export const ValidationRules = {
  // ID验证
  id: z.string().regex(/^\d+$/, '无效的ID格式').transform(str => BigInt(str)),
  
  // 邮箱验证
  email: z.string().email('无效的邮箱格式').max(255, '邮箱长度不能超过255字符'),
  
  // 用户名验证
  username: z.string()
    .min(2, '用户名至少2个字符')
    .max(50, '用户名不能超过50个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '用户名只能包含字母、数字、下划线和横线'),
  
  // 密码验证
  password: z.string()
    .min(8, '密码至少8个字符')
    .max(128, '密码不能超过128个字符')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, '密码必须包含大小写字母和数字'),
  
  // API Key验证
  apiKey: z.string()
    .min(10, 'API Key长度至少10个字符')
    .max(255, 'API Key长度不能超过255个字符')
    .regex(/^[a-zA-Z0-9._-]+$/, 'API Key格式无效'),
  
  // 分页参数验证
  page: z.number().int().min(1, '页码必须大于0').default(1),
  pageSize: z.number().int().min(1, '页面大小必须大于0').max(100, '页面大小不能超过100').default(10),
  
  // 排序验证
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  
  // 时间范围验证
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).refine(data => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate)
    }
    return true
  }, '开始时间必须早于结束时间'),
  
  // URL验证
  url: z.string().url('无效的URL格式').max(2048, 'URL长度不能超过2048字符'),
  
  // JSON字符串验证
  jsonString: z.string().refine(str => {
    try {
      JSON.parse(str)
      return true
    } catch {
      return false
    }
  }, '无效的JSON格式'),
  
  // 文本内容验证
  text: z.string().max(10000, '文本内容不能超过10000字符'),
  
  // 名称验证
  name: z.string()
    .min(1, '名称不能为空')
    .max(100, '名称不能超过100字符')
    .regex(/^[^<>\"'&]+$/, '名称包含非法字符'),
}

/**
 * 用户相关验证模式
 */
export const UserValidation = {
  create: z.object({
    email: ValidationRules.email,
    username: ValidationRules.username,
    password: ValidationRules.password,
    role: z.enum(['USER', 'ADMIN', 'READONLY']),
  }),
  
  update: z.object({
    email: ValidationRules.email.optional(),
    username: ValidationRules.username.optional(),
    password: ValidationRules.password.optional(),
    role: z.enum(['USER', 'ADMIN', 'READONLY']).optional(),
    isActive: z.boolean().optional(),
  }),
  
  list: z.object({
    page: ValidationRules.page,
    pageSize: ValidationRules.pageSize,
    search: z.string().max(100).optional(),
    role: z.enum(['USER', 'ADMIN', 'READONLY']).optional(),
    isActive: z.boolean().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'username', 'email']).optional(),
    sortOrder: ValidationRules.sortOrder,
  }),
}

/**
 * API Key相关验证模式
 */
export const ApiKeyValidation = {
  create: z.object({
    userId: ValidationRules.id,
    name: ValidationRules.name,
    permissions: z.array(z.string()).min(1, '至少需要一个权限'),
    rateLimit: z.number().int().min(1, '限流值必须大于0').optional(),
    expiresAt: z.string().datetime().optional(),
  }),
  
  update: z.object({
    name: ValidationRules.name.optional(),
    permissions: z.array(z.string()).min(1, '至少需要一个权限').optional(),
    rateLimit: z.number().int().min(1, '限流值必须大于0').optional(),
    isActive: z.boolean().optional(),
    expiresAt: z.string().datetime().optional(),
  }),
  
  list: z.object({
    page: ValidationRules.page,
    pageSize: ValidationRules.pageSize,
    userId: ValidationRules.id.optional(),
    search: z.string().max(100).optional(),
    isActive: z.boolean().optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'lastUsedAt']).optional(),
    sortOrder: ValidationRules.sortOrder,
  }),
}

/**
 * 上游账号相关验证模式
 */
export const AccountValidation = {
  create: z.object({
    userId: ValidationRules.id,
    name: ValidationRules.name,
    type: z.enum(['CLAUDE_CODE', 'GEMINI_CLI', 'ANTHROPIC_OAUTH']),
    credentials: z.record(z.string(), z.any()),
    description: ValidationRules.text.optional(),
  }),
  
  update: z.object({
    name: ValidationRules.name.optional(),
    credentials: z.record(z.string(), z.any()).optional(),
    description: ValidationRules.text.optional(),
    isActive: z.boolean().optional(),
  }),
  
  list: z.object({
    page: ValidationRules.page,
    pageSize: ValidationRules.pageSize,
    userId: ValidationRules.id.optional(),
    type: z.enum(['CLAUDE_CODE', 'GEMINI_CLI', 'ANTHROPIC_OAUTH']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ERROR']).optional(),
    search: z.string().max(100).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'name', 'lastHealthCheck']).optional(),
    sortOrder: ValidationRules.sortOrder,
  }),
}

/**
 * 使用记录相关验证模式
 */
export const UsageValidation = {
  record: z.object({
    apiKeyId: ValidationRules.id,
    upstreamAccountId: ValidationRules.id.optional(),
    requestId: z.string().min(1).max(100),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    endpoint: z.string().min(1).max(500),
    model: z.string().max(100).optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    responseTime: z.number().int().min(0).optional(),
    inputTokens: z.number().int().min(0).default(0),
    outputTokens: z.number().int().min(0).default(0),
    cacheCreationInputTokens: z.number().int().min(0).default(0),
    cacheReadInputTokens: z.number().int().min(0).default(0),
    cost: z.number().min(0).optional(),
    errorMessage: z.string().max(1000).optional(),
    userAgent: z.string().max(500).optional(),
    clientIp: z.string().max(45).optional(),
  }),
  
  list: z.object({
    page: ValidationRules.page,
    pageSize: ValidationRules.pageSize,
    apiKeyId: ValidationRules.id.optional(),
    upstreamAccountId: ValidationRules.id.optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    hasError: z.boolean().optional(),
    sortBy: z.enum(['createdAt', 'responseTime', 'cost']).optional(),
    sortOrder: ValidationRules.sortOrder,
  }),
}

/**
 * 验证器类
 */
export class InputValidator {
  /**
   * 验证输入数据
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: boolean
    data?: T
    errors?: string[]
  } {
    try {
      const result = schema.parse(data)
      return { success: true, data: result }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => {
          const path = err.path.length > 0 ? `${err.path.join('.')}: ` : ''
          return `${path}${err.message}`
        })
        return { success: false, errors }
      }
      return { success: false, errors: ['验证失败'] }
    }
  }

  /**
   * 安全解析JSON
   */
  static safeParseJSON<T>(jsonString: string, schema?: z.ZodSchema<T>): {
    success: boolean
    data?: T
    error?: string
  } {
    try {
      const parsed = JSON.parse(jsonString)
      
      if (schema) {
        const validation = this.validate(schema, parsed)
        if (!validation.success) {
          return { success: false, error: validation.errors?.join(', ') }
        }
        return { success: true, data: validation.data }
      }
      
      return { success: true, data: parsed }
    } catch (error) {
      return { success: false, error: 'JSON格式无效' }
    }
  }

  /**
   * 清理HTML标签
   */
  static sanitizeHtml(input: string): string {
    return input
      .replace(/<[^>]*>/g, '') // 移除HTML标签
      .replace(/&[^;]+;/g, '') // 移除HTML实体
      .trim()
  }

  /**
   * 清理SQL注入风险字符
   */
  static sanitizeSql(input: string): string {
    return input
      .replace(/['";\\]/g, '') // 移除潜在的SQL注入字符
      .trim()
  }

  /**
   * 验证并清理用户输入
   */
  static sanitizeUserInput(input: string): string {
    return this.sanitizeSql(this.sanitizeHtml(input))
  }

  /**
   * 验证文件路径安全性
   */
  static validatePath(path: string): boolean {
    // 检查路径遍历攻击
    if (path.includes('..') || path.includes('~')) {
      return false
    }
    
    // 检查绝对路径
    if (path.startsWith('/') || path.includes(':')) {
      return false
    }
    
    return true
  }

  /**
   * 验证IP地址
   */
  static validateIP(ip: string): boolean {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/
    
    return ipv4Regex.test(ip) || ipv6Regex.test(ip)
  }

  /**
   * 验证请求速率限制
   */
  static checkRateLimit(requests: number, timeWindow: number, limit: number): boolean {
    return requests <= limit
  }
}

/**
 * 中间件：验证请求参数
 */
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const validation = InputValidator.validate(schema, req.body)
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数验证失败',
          details: validation.errors
        }
      })
    }
    
    req.validatedData = validation.data
    next()
  }
}

/**
 * 中间件：验证查询参数
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    const validation = InputValidator.validate(schema, req.query)
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '查询参数验证失败',
          details: validation.errors
        }
      })
    }
    
    req.validatedQuery = validation.data
    next()
  }
}

/**
 * 安全头部验证
 */
export const SecurityHeaders = {
  validateAuthHeader: (authHeader: string | null): { valid: boolean; token?: string; error?: string } => {
    if (!authHeader) {
      return { valid: false, error: '缺少认证头部' }
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      return { valid: false, error: '无效的认证格式' }
    }
    
    const token = authHeader.slice(7)
    if (!token || token.length < 10) {
      return { valid: false, error: '无效的认证令牌' }
    }
    
    return { valid: true, token }
  },
  
  validateContentType: (contentType: string | null, expected: string = 'application/json'): boolean => {
    return contentType?.includes(expected) ?? false
  },
  
  validateUserAgent: (userAgent: string | null): boolean => {
    // 基本的User-Agent验证，过滤明显的恶意请求
    if (!userAgent) return false
    
    const suspiciousPatterns = [
      /script/i,
      /javascript/i,
      /vbscript/i,
      /onload/i,
      /onerror/i,
    ]
    
    return !suspiciousPatterns.some(pattern => pattern.test(userAgent))
  }
}

/**
 * 导出常用验证函数
 */
export const validate = InputValidator.validate
export const sanitize = InputValidator.sanitizeUserInput