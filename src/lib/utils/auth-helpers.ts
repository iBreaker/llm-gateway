import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UserProfile } from '@/types/auth'

// 从请求中获取当前用户
export async function getCurrentUser(request: NextRequest) {
  const supabase = createClient()
  
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

// 获取用户配置
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('获取用户配置失败:', error)
    return null
  }

  return data
}

// 检查用户权限
export async function checkUserPermission(
  userId: string,
  requiredRole: 'admin' | 'user' | 'viewer' = 'user'
): Promise<boolean> {
  const profile = await getUserProfile(userId)
  
  if (!profile) {
    return false
  }

  const roleHierarchy = {
    viewer: 0,
    user: 1,
    admin: 2,
  }

  return roleHierarchy[profile.role] >= roleHierarchy[requiredRole]
}

// 从请求头中获取用户ID（由中间件设置）
export function getUserIdFromHeaders(request: NextRequest): string | null {
  return request.headers.get('x-user-id')
}

// 创建认证响应（未授权）
export function createUnauthorizedResponse(message: string = '未授权访问') {
  return Response.json(
    { error: message, code: 'UNAUTHORIZED' },
    { status: 401 }
  )
}

// 创建权限不足响应
export function createForbiddenResponse(message: string = '权限不足') {
  return Response.json(
    { error: message, code: 'FORBIDDEN' },
    { status: 403 }
  )
}

// API路由认证装饰器
export function withAuth(
  handler: (request: NextRequest, context: { user: any; userId: string }) => Promise<Response>,
  options: {
    requiredRole?: 'admin' | 'user' | 'viewer'
  } = {}
) {
  return async (request: NextRequest, ...args: any[]) => {
    const userId = getUserIdFromHeaders(request)
    
    if (!userId) {
      return createUnauthorizedResponse()
    }

    // 检查权限
    if (options.requiredRole) {
      const hasPermission = await checkUserPermission(userId, options.requiredRole)
      if (!hasPermission) {
        return createForbiddenResponse()
      }
    }

    const user = await getCurrentUser(request)
    if (!user) {
      return createUnauthorizedResponse()
    }

    return handler(request, { user, userId, ...args })
  }
}

// 记录用户活动日志
export async function logUserActivity(
  userId: string,
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, any>,
  request?: NextRequest
) {
  const supabase = createClient()
  
  const logData = {
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    metadata: metadata || {},
    ip_address: request?.ip || request?.headers.get('x-forwarded-for') || request?.headers.get('x-real-ip'),
    user_agent: request?.headers.get('user-agent'),
  }

  const { error } = await supabase
    .from('user_activity_logs')
    .insert(logData)

  if (error) {
    console.error('记录用户活动失败:', error)
  }
}