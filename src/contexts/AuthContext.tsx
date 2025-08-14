'use client'

import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
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
  const hasCheckedAuth = useRef(false)

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    setUser(null)
    router.push('/auth/login')
  }

  useEffect(() => {
    console.log('🔍 AuthContext: useEffect 触发', { pathname, hasChecked: hasCheckedAuth.current, isLoading, user })
    
    // 登录页面直接设置为非加载状态，不做任何检查
    if (pathname.startsWith('/auth/login')) {
      console.log('✅ AuthContext: 登录页面，直接设置非加载状态')
      if (isLoading) {
        setIsLoading(false)
        hasCheckedAuth.current = true
      }
      return
    }

    // 如果已经有用户信息且已检查过，跳过
    if (hasCheckedAuth.current && user) {
      console.log('🔍 AuthContext: 已检查过且有用户信息，跳过')
      return
    }

    console.log('🔍 AuthContext: 执行认证检查')
    const token = localStorage.getItem('access_token')
    
    if (!token) {
      console.log('❌ AuthContext: 无token，跳转登录')
      setUser(null)
      setIsLoading(false)
      hasCheckedAuth.current = true
      router.push('/auth/login')
      return
    }

    console.log('✅ AuthContext: 有token，尝试获取用户信息')
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const userData = JSON.parse(userStr)
        console.log('✅ AuthContext: 用户数据解析成功', userData)
        setUser({
          id: userData.id.toString(),
          email: userData.email,
          username: userData.username,
          role: 'user'
        })
      } catch (error) {
        console.error('❌ AuthContext: 用户数据解析失败', error)
        localStorage.clear()
        setUser(null)
        router.push('/auth/login')
      }
    } else {
      console.log('❌ AuthContext: 无用户数据，跳转登录')
      setUser(null)
      router.push('/auth/login')
    }
    
    setIsLoading(false)
    hasCheckedAuth.current = true
  }, [pathname, user])

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