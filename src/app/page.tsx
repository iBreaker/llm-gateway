import { redirect } from 'next/navigation'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default async function HomePage() {
  try {
    // 检查系统是否已初始化
    const userCount = await prisma.user.count()
    
    if (userCount === 0) {
      // 系统未初始化，重定向到初始化页面
      redirect('/init')
    } else {
      // 系统已初始化，重定向到登录页面
      redirect('/auth/login')
    }
  } catch (error) {
    // 数据库连接错误，可能是首次部署，重定向到初始化页面
    console.error('数据库连接错误:', error)
    redirect('/init')
  } finally {
    await prisma.$disconnect()
  }
}