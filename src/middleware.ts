import { NextRequest, NextResponse } from 'next/server'

/**
 * 简化的中间件 - 使用 API 调用检查状态
 * 因为 Prisma 不能在 Edge Runtime 中运行
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // 跳过静态资源、API 路由和初始化相关路径
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') || // 静态文件
    pathname === '/init' ||   // 允许访问初始化页面
    pathname === '/auth/login' // 允许访问登录页面
  ) {
    return NextResponse.next()
  }

  // 对于其他路径，重定向到登录页面
  // 具体的初始化判断由页面组件处理
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }
  
  return NextResponse.next()
}

// 配置中间件匹配路径
export const config = {
  matcher: [
    /*
     * 匹配所有请求路径，除了以下开头的：
     * - api (API 路由)
     * - _next/static (静态文件)
     * - _next/image (图片优化)
     * - favicon.ico (网站图标)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}