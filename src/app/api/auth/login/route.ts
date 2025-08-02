import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { verifyPassword } from '@/lib/auth/password'
import { generateToken } from '@/lib/auth/jwt'

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // 验证输入
    if (!email || !password) {
      return NextResponse.json(
        { message: '邮箱和密码不能为空' },
        { status: 400 }
      )
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true
      }
    })

    if (!user) {
      return NextResponse.json(
        { message: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    // 检查用户是否激活
    if (!user.isActive) {
      return NextResponse.json(
        { message: '账号已被禁用' },
        { status: 401 }
      )
    }

    // 验证密码
    const isValidPassword = await verifyPassword(password, user.passwordHash)
    if (!isValidPassword) {
      return NextResponse.json(
        { message: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    // 生成 JWT Token
    const token = await generateToken({
      userId: user.id.toString(),
      email: user.email,
      role: user.role
    })

    // 更新最后登录时间 (可选)
    await prisma.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date() }
    })

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id.toString(),
        email: user.email,
        role: user.role
      }
    })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { message: '服务器错误' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}