import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '@/lib/auth/password'

const prisma = new PrismaClient()

/**
 * 初始化系统 - 创建默认管理员账号
 * 只有在没有任何用户的情况下才能调用
 */
export async function POST(request: NextRequest) {
  try {
    // 检查是否已有用户
    const userCount = await prisma.user.count()
    
    if (userCount > 0) {
      return NextResponse.json(
        { 
          message: '系统已初始化，已存在用户账号',
          initialized: true 
        },
        { status: 400 }
      )
    }

    // 默认管理员信息
    const email = 'admin@llm-gateway.com'
    const password = 'Admin123!'
    const username = 'admin'
    
    // 创建密码哈希
    const passwordHash = await hashPassword(password)
    
    // 创建管理员用户
    const admin = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        role: 'ADMIN',
        isActive: true
      }
    })
    
    return NextResponse.json({
      message: '系统初始化成功！默认管理员账号已创建',
      initialized: true,
      admin: {
        id: admin.id.toString(),
        email: admin.email,
        username: admin.username,
        role: admin.role
      },
      credentials: {
        email,
        password,
        warning: '请立即登录并修改默认密码！'
      }
    })
    
  } catch (error) {
    console.error('系统初始化失败:', error)
    return NextResponse.json(
      { 
        message: '系统初始化失败',
        error: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * 检查系统初始化状态
 */
export async function GET() {
  try {
    const userCount = await prisma.user.count()
    
    return NextResponse.json({
      initialized: userCount > 0,
      userCount,
      needsInit: userCount === 0
    })
    
  } catch (error) {
    console.error('检查初始化状态失败:', error)
    return NextResponse.json(
      { 
        message: '检查初始化状态失败',
        error: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}