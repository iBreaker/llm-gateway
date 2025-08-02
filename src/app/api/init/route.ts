import { NextRequest, NextResponse } from 'next/server'
import { hashPassword } from '@/lib/auth/password'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

// 强制动态渲染
export const dynamic = 'force-dynamic'

// 全局初始化令牌（重启后失效）
let initToken: string | null = null
let initTokenExpiry: number | null = null


/**
 * 生成初始化令牌（仅在首次访问时）
 */
function generateInitToken(): string {
  if (!initToken || !initTokenExpiry || Date.now() > initTokenExpiry) {
    initToken = crypto.randomBytes(32).toString('hex')
    initTokenExpiry = Date.now() + 30 * 60 * 1000 // 30分钟过期
  }
  return initToken
}

/**
 * 验证初始化令牌
 */
function validateInitToken(token: string): boolean {
  return initToken === token && initTokenExpiry !== null && Date.now() <= initTokenExpiry
}

/**
 * 初始化系统 - 创建默认管理员账号
 * 需要提供初始化令牌（安全措施）
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

    // 验证初始化令牌
    const body = await request.json()
    const { token } = body
    
    if (!token || !validateInitToken(token)) {
      return NextResponse.json(
        { 
          message: '无效的初始化令牌',
          error: 'INVALID_TOKEN'
        },
        { status: 403 }
      )
    }

    // 生成安全的随机密码
    const generateSecurePassword = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
      let password = ''
      
      // 确保包含各种字符类型
      password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)] // 大写字母
      password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)] // 小写字母  
      password += '0123456789'[Math.floor(Math.random() * 10)] // 数字
      password += '!@#$%^&*'[Math.floor(Math.random() * 8)] // 特殊字符
      
      // 填充剩余长度
      for (let i = 4; i < 16; i++) {
        password += chars[Math.floor(Math.random() * chars.length)]
      }
      
      // 随机打乱密码
      return password.split('').sort(() => Math.random() - 0.5).join('')
    }

    // 默认管理员信息
    const email = 'admin@llm-gateway.com'
    const password = generateSecurePassword()
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
 * 检查系统初始化状态并获取初始化令牌
 */
export async function GET() {
  try {
    const userCount = await prisma.user.count()
    const needsInit = userCount === 0
    
    // 只有在需要初始化时才生成令牌
    const token = needsInit ? generateInitToken() : null
    
    return NextResponse.json({
      initialized: userCount > 0,
      userCount,
      needsInit,
      initToken: token, // 初始化令牌（仅在需要时提供）
      tokenExpiry: initTokenExpiry
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