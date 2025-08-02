import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

// 创建全局 Prisma 实例
const prisma = new PrismaClient()

/**
 * 检查系统初始化状态的中间件
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
  // 跳过静态资源和 API 路由
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // 静态文件
  ) {
    return NextResponse.next()
  }

  try {
    // 检查系统是否已初始化
    const userCount = await prisma.user.count()
    const needsInit = userCount === 0
    
    // 根据当前路径和初始化状态决定重定向
    if (needsInit) {
      // 系统未初始化
      if (pathname !== '/init') {
        return NextResponse.redirect(new URL('/init', request.url))
      }
    } else {
      // 系统已初始化
      if (pathname === '/init') {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/auth/login', request.url))
      }
    }
    
    return NextResponse.next()
    
  } catch (error) {
    console.error('中间件数据库连接错误:', error)
    
    // 数据库连接失败，可能是首次部署
    if (pathname !== '/init') {
      return NextResponse.redirect(new URL('/init', request.url))
    }
    
    return NextResponse.next()
  }
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