'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

interface User {
  id: string
  email: string
  username: string
  role: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    setUser(null)
    router.push('/auth/login')
  }

  useEffect(() => {
    console.log('🔍 AuthContext: checkAuth 开始执行, pathname:', pathname)
    
    const checkAuth = async () => {
      // 如果是登录页面，直接跳过认证检查 (处理带/不带尾部斜杠的情况)
      if (pathname === '/auth/login' || pathname === '/auth/login/') {
        console.log('✅ AuthContext: 检测到登录页面，跳过认证检查')
        setIsLoading(false)
        return
      }

      console.log('🔍 AuthContext: 非登录页面，检查token')
      const token = localStorage.getItem('access_token')
      const userStr = localStorage.getItem('user')
      
      if (!token) {
        console.log('❌ AuthContext: 没有token，跳转到登录页面')
        router.push('/auth/login')
        setIsLoading(false)
        return
      }

      // 从localStorage获取用户信息
      try {
        console.log('✅ AuthContext: 有token，设置用户信息')
        if (userStr) {
          const userData = JSON.parse(userStr)
          setUser({
            id: userData.id.toString(),
            email: userData.email,
            username: userData.username,
            role: 'user' // 默认角色
          })
        } else {
          // 如果没有用户数据，使用默认值
          setUser({
            id: '1',
            email: 'user@example.com',
            username: 'user',
            role: 'user'
          })
        }
      } catch (error) {
        console.error('❌ AuthContext: Auth check failed:', error)
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        router.push('/auth/login')
      } finally {
        console.log('🏁 AuthContext: 设置 isLoading = false')
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router, pathname])

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}