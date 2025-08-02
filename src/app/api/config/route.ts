import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { getAllConfigs, setConfigs, getConfig } from '@/lib/config'

async function handleGetConfig(request: AuthenticatedRequest) {
  try {
    const config = await getAllConfigs()
    
    // 添加默认配置值
    const defaultConfig = {
      systemName: 'LLM Gateway',
      maxConcurrentRequests: 100,
      requestTimeout: 30,
      enableRateLimit: false,
      enableAuditLog: true,
      allowedOrigins: '',
      enableCache: false,
      cacheExpiration: 60,
      enableMetrics: true,
      metricsRetentionDays: 30,
      ...config
    }

    return NextResponse.json({ config: defaultConfig })
  } catch (error) {
    console.error('获取系统配置失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

async function handleUpdateConfig(request: AuthenticatedRequest) {
  try {
    const { config } = await request.json()
    
    if (!config || typeof config !== 'object') {
      return NextResponse.json(
        { message: '无效的配置数据' },
        { status: 400 }
      )
    }

    // 验证配置值
    const validatedConfig: Record<string, any> = {}
    
    // 基础设置验证
    if (config.systemName !== undefined) {
      validatedConfig.systemName = String(config.systemName).trim()
    }
    if (config.maxConcurrentRequests !== undefined) {
      const value = parseInt(config.maxConcurrentRequests)
      if (value > 0 && value <= 1000) {
        validatedConfig.maxConcurrentRequests = value
      }
    }
    if (config.requestTimeout !== undefined) {
      const value = parseInt(config.requestTimeout)
      if (value > 0 && value <= 300) {
        validatedConfig.requestTimeout = value
      }
    }

    // 安全设置验证
    if (config.enableRateLimit !== undefined) {
      validatedConfig.enableRateLimit = Boolean(config.enableRateLimit)
    }
    if (config.enableAuditLog !== undefined) {
      validatedConfig.enableAuditLog = Boolean(config.enableAuditLog)
    }
    if (config.allowedOrigins !== undefined) {
      validatedConfig.allowedOrigins = String(config.allowedOrigins).trim()
    }

    // 缓存设置验证
    if (config.enableCache !== undefined) {
      validatedConfig.enableCache = Boolean(config.enableCache)
    }
    if (config.cacheExpiration !== undefined) {
      const value = parseInt(config.cacheExpiration)
      if (value > 0 && value <= 1440) { // 最大24小时
        validatedConfig.cacheExpiration = value
      }
    }

    // 监控设置验证
    if (config.enableMetrics !== undefined) {
      validatedConfig.enableMetrics = Boolean(config.enableMetrics)
    }
    if (config.metricsRetentionDays !== undefined) {
      const value = parseInt(config.metricsRetentionDays)
      if (value > 0 && value <= 365) { // 最大1年
        validatedConfig.metricsRetentionDays = value
      }
    }

    // 批量更新配置
    await setConfigs(validatedConfig)

    return NextResponse.json({ 
      message: '配置更新成功',
      updated: Object.keys(validatedConfig),
      config: await getAllConfigs()
    })
  } catch (error) {
    console.error('更新系统配置失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetConfig, { requiredRoles: ['ADMIN'] })
export const PUT = withAuth(handleUpdateConfig, { requiredRoles: ['ADMIN'] })