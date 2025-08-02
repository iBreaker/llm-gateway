#!/usr/bin/env ts-node

/**
 * 创建默认管理员用户脚本
 */

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth/password'

const prisma = new PrismaClient()

async function createAdmin() {
  console.log('🔧 创建默认管理员用户...')
  
  const email = 'admin@llm-gateway.com'
  const password = 'Admin123!'
  const username = 'admin'
  
  try {
    // 检查是否已存在管理员
    const existingAdmin = await prisma.user.findUnique({
      where: { email }
    })
    
    if (existingAdmin) {
      console.log('⏭️  管理员用户已存在，跳过创建')
      console.log(`📧 邮箱: ${email}`)
      return
    }
    
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
    
    console.log('✅ 管理员用户创建成功！')
    console.log('📧 邮箱:', email)
    console.log('🔑 密码:', password)
    console.log('👤 用户ID:', admin.id.toString())
    console.log('')
    console.log('⚠️  请立即登录并修改默认密码！')
    
  } catch (error) {
    console.error('❌ 创建管理员失败:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// 执行创建
createAdmin()