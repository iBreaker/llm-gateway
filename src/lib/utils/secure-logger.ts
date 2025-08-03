/**
 * 安全日志记录工具
 * 防止敏感信息泄露
 */

/**
 * 敏感信息脱敏配置
 */
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'sessionKey',
  'secret',
  'credentials',
  'encryptedCredentials',
  'authorization',
  'x-api-key',
  'private_key',
  'privateKey'
]

/**
 * 敏感值匹配模式
 */
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{32,}/g,  // API keys
  /Bearer\s+[a-zA-Z0-9._-]+/g,  // Bearer tokens
  /password[=:]\s*[^\s,}]+/gi,  // Password patterns
  /token[=:]\s*[^\s,}]+/gi,     // Token patterns
  /key[=:]\s*[^\s,}]+/gi,       // Key patterns
]

/**
 * 日志级别
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * 安全日志记录器
 */
export class SecureLogger {
  private static instance: SecureLogger
  private isDevelopment: boolean
  private logLevel: LogLevel

  private constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development'
    this.logLevel = this.getLogLevel()
  }

  public static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger()
    }
    return SecureLogger.instance
  }

  private getLogLevel(): LogLevel {
    const level = process.env.LOG_LEVEL?.toLowerCase()
    switch (level) {
      case 'error': return LogLevel.ERROR
      case 'warn': return LogLevel.WARN
      case 'info': return LogLevel.INFO
      case 'debug': return LogLevel.DEBUG
      default: return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO
    }
  }

  /**
   * 脱敏敏感信息
   */
  private sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data
    }

    if (typeof data === 'bigint') {
      return data.toString()
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data)
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item))
    }

    if (typeof data === 'object') {
      return this.sanitizeObject(data)
    }

    return data
  }

  private sanitizeString(str: string): string {
    let result = str

    // 替换敏感模式
    SENSITIVE_PATTERNS.forEach(pattern => {
      result = result.replace(pattern, '[REDACTED]')
    })

    return result
  }

  private sanitizeObject(obj: Record<string, any>): any {
    const sanitized: Record<string, any> = {}

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()
      
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]'
      } else {
        sanitized[key] = this.sanitize(value)
      }
    }

    return sanitized
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: LogLevel, message: string, context?: any): string {
    const timestamp = new Date().toISOString()
    const sanitizedContext = context ? this.sanitize(context) : undefined
    
    let formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`
    
    if (sanitizedContext) {
      formatted += ` | Context: ${JSON.stringify(sanitizedContext, null, 2)}`
    }

    return formatted
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: Error | any, context?: any): void {
    const errorContext = error ? {
      ...context,
      error: {
        message: error.message,
        stack: this.isDevelopment ? error.stack : '[REDACTED]',
        name: error.name,
        code: error.code || undefined
      }
    } : context

    console.error(this.formatMessage(LogLevel.ERROR, message, errorContext))
  }

  /**
   * 记录警告日志
   */
  warn(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(LogLevel.WARN, message, context))
    }
  }

  /**
   * 记录信息日志
   */
  info(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage(LogLevel.INFO, message, context))
    }
  }

  /**
   * 记录调试日志
   */
  debug(message: string, context?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage(LogLevel.DEBUG, message, context))
    }
  }

  /**
   * 检查是否应该记录特定级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG]
    return levels.indexOf(level) <= levels.indexOf(this.logLevel)
  }

  /**
   * 记录账号相关操作（安全版本）
   */
  logAccountOperation(operation: string, accountId: string | bigint, details?: any): void {
    this.info(`账号操作: ${operation}`, {
      accountId: accountId.toString(),
      operation,
      ...this.sanitize(details)
    })
  }

  /**
   * 记录用户操作（安全版本）
   */
  logUserOperation(operation: string, userId: string | bigint, details?: any): void {
    this.info(`用户操作: ${operation}`, {
      userId: userId.toString(),
      operation,
      ...this.sanitize(details)
    })
  }

  /**
   * 记录API请求（安全版本）
   */
  logApiRequest(method: string, endpoint: string, statusCode: number, duration: number, details?: any): void {
    this.info(`API请求: ${method} ${endpoint} -> ${statusCode} (${duration}ms)`, {
      method,
      endpoint,
      statusCode,
      duration,
      ...this.sanitize(details)
    })
  }

  /**
   * 记录安全事件
   */
  logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high', details?: any): void {
    const level = severity === 'high' ? LogLevel.ERROR : severity === 'medium' ? LogLevel.WARN : LogLevel.INFO
    
    if (level === LogLevel.ERROR) {
      this.error(`安全事件: ${event}`, undefined, { severity, ...this.sanitize(details) })
    } else if (level === LogLevel.WARN) {
      this.warn(`安全事件: ${event}`, { severity, ...this.sanitize(details) })
    } else {
      this.info(`安全事件: ${event}`, { severity, ...this.sanitize(details) })
    }
  }
}

/**
 * 导出单例实例
 */
export const logger = SecureLogger.getInstance()

/**
 * 便捷函数
 */
export const secureLog = {
  error: (message: string, error?: Error | any, context?: any) => logger.error(message, error, context),
  warn: (message: string, context?: any) => logger.warn(message, context),
  info: (message: string, context?: any) => logger.info(message, context),
  debug: (message: string, context?: any) => logger.debug(message, context),
  
  // 专用日志函数
  accountOp: (operation: string, accountId: string | bigint, details?: any) => 
    logger.logAccountOperation(operation, accountId, details),
  
  userOp: (operation: string, userId: string | bigint, details?: any) => 
    logger.logUserOperation(operation, userId, details),
  
  apiReq: (method: string, endpoint: string, statusCode: number, duration: number, details?: any) => 
    logger.logApiRequest(method, endpoint, statusCode, duration, details),
  
  security: (event: string, severity: 'low' | 'medium' | 'high', details?: any) => 
    logger.logSecurityEvent(event, severity, details),
}

/**
 * 创建结构化日志中间件
 */
export function createRequestLogger() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now()
    
    res.on('finish', () => {
      const duration = Date.now() - startTime
      secureLog.apiReq(
        req.method,
        req.url,
        res.statusCode,
        duration,
        {
          userAgent: req.headers['user-agent'],
          ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
          contentLength: res.get('content-length')
        }
      )
    })
    
    next()
  }
}

/**
 * 环境变量验证和脱敏
 */
export function logEnvironmentInfo(): void {
  const safeEnvVars = {
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    DATABASE_URL: process.env.DATABASE_URL ? '[REDACTED]' : 'not set',
    JWT_SECRET: process.env.JWT_SECRET ? '[REDACTED]' : 'not set',
    ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY ? '[REDACTED]' : 'not set',
  }

  secureLog.info('Environment configuration loaded', safeEnvVars)
}