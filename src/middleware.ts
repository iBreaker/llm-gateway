import { createClient } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

// 需要认证的路径模式
const PROTECTED_PATHS = [
  '/dashboard',
  '/api/dashboard',
]

// 认证页面路径（已登录用户访问时重定向到dashboard）
const AUTH_PATHS = [
  '/auth/login',
  '/auth/signup', 
  '/auth/forgot-password',
]

// 公开API路径（不需要认证）
const PUBLIC_API_PATHS = [
  '/api/health',
  '/api/oauth',
  '/api/debug',
  '/api/dashboard/api-keys/create', // 临时添加，用于测试
]

// 管理员专用路径
const ADMIN_PATHS = [
  '/admin',
  '/api/admin',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 跳过静态文件和Next.js内部路径
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // 创建Supabase客户端
  const { supabase, response } = createClient(request)

  // 获取当前用户会话
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 检查是否为公开API路径（优先检查）
  const isPublicApiPath = PUBLIC_API_PATHS.some(path => pathname === path || pathname.startsWith(path))
  if (isPublicApiPath) {
    console.log('🔓 公开API路径:', pathname)
    return response
  }

  // 检查是否为受保护的路径
  const isProtectedPath = PROTECTED_PATHS.some(path => pathname.startsWith(path))
  
  // 如果是受保护的路径但用户未登录，重定向到登录页
  if (isProtectedPath && !user) {
    console.log('🔒 受保护路径，用户未登录:', pathname)
    const redirectUrl = new URL('/auth/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // 如果用户已登录但访问认证页面，重定向到dashboard
  const isAuthPath = AUTH_PATHS.some(path => pathname.startsWith(path))
  if (isAuthPath && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // 检查管理员权限
  const isAdminPath = ADMIN_PATHS.some(path => pathname.startsWith(path))
  if (isAdminPath && user) {
    try {
      // 获取用户配置检查管理员权限
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile || profile.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
    } catch (error) {
      console.error('检查管理员权限失败:', error)
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // 为受保护的API路径添加用户信息到请求头
  if (pathname.startsWith('/api/') && user) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.id)
    requestHeaders.set('x-user-email', user.email || '')

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * 匹配所有请求路径，除了以下开头的：
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}