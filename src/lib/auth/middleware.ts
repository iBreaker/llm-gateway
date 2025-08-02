import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, extractTokenFromHeader } from './jwt'

export interface AuthenticatedRequest extends NextRequest {
  user: {
    userId: string
    email: string
    role: string
    id: bigint
  }
}

/**
 * 认证中间件
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse | null> {
  // 提取 Token
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token) {
    return NextResponse.json(
      { message: '未提供认证令牌' },
      { status: 401 }
    )
  }

  // 验证 Token
  const payload = await verifyToken(token)
  if (!payload) {
    return NextResponse.json(
      { message: '无效的认证令牌' },
      { status: 401 }
    )
  }

  // 将用户信息添加到请求中
  ;(request as AuthenticatedRequest).user = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    id: BigInt(payload.userId)
  }

  return null // 继续处理请求
}

/**
 * 检查用户角色权限
 */
export function checkRole(allowedRoles: string[]) {
  return (request: AuthenticatedRequest): NextResponse | null => {
    const user = request.user
    
    if (!user) {
      return NextResponse.json(
        { message: '未认证的用户' },
        { status: 401 }
      )
    }

    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { message: '权限不足' },
        { status: 403 }
      )
    }

    return null // 权限检查通过
  }
}

/**
 * 创建受保护的 API 处理函数
 */
export function withAuth(
  handler: (request: AuthenticatedRequest, context?: any) => Promise<NextResponse>,
  options: { requiredRoles?: string[] } = {}
) {
  return async (request: NextRequest, context?: any): Promise<NextResponse> => {
    // 执行认证中间件
    const authResult = await authMiddleware(request)
    if (authResult) {
      return authResult
    }

    // 检查角色权限
    if (options.requiredRoles) {
      const roleResult = checkRole(options.requiredRoles)(request as AuthenticatedRequest)
      if (roleResult) {
        return roleResult
      }
    }

    // 执行实际的处理函数
    return handler(request as AuthenticatedRequest, context)
  }
}