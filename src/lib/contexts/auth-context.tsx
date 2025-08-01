'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthContextType, AuthUser, SignInData, SignUpData, UserProfile } from '@/types/auth'
import { User, Session } from '@supabase/supabase-js'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // 确保用户配置存在
    const ensureUserProfile = async (user: User) => {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (error && error.code === 'PGRST116') {
          // 用户配置不存在，创建一个
          await supabase
            .from('user_profiles')
            .insert({
              id: user.id,
              email: user.email!,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
              avatar_url: user.user_metadata?.avatar_url,
              role: 'user',
            })
        }
      } catch (error) {
        console.error('创建用户配置失败:', error)
      }
    }

    // 获取初始会话
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user as AuthUser || null)
      setLoading(false)
    }

    getInitialSession()

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user as AuthUser || null)
      setLoading(false)

      // 在用户登录时获取用户配置
      if (session?.user && event === 'SIGNED_IN') {
        await ensureUserProfile(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signIn = async (data: SignInData) => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setLoading(false)
      throw new Error(`登录失败: ${error.message}`)
    }
    // 登录成功后，onAuthStateChange 会处理状态更新
  }

  const signUp = async (data: SignUpData) => {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.full_name || data.email.split('@')[0],
        },
      },
    })

    if (error) {
      setLoading(false)
      throw new Error(`注册失败: ${error.message}`)
    }
    // 注册成功后，onAuthStateChange 会处理状态更新
  }

  const signOut = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    
    if (error) {
      setLoading(false)
      throw new Error(`登出失败: ${error.message}`)
    }
    // 登出成功后，onAuthStateChange 会处理状态更新
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (error) {
      throw new Error(`密码重置失败: ${error.message}`)
    }
  }

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) {
      throw new Error('用户未登录')
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      throw new Error(`更新配置失败: ${error.message}`)
    }

    // 如果更新了认证相关信息，也更新 auth.users
    if (updates.full_name) {
      await supabase.auth.updateUser({
        data: { full_name: updates.full_name }
      })
    }
  }

  const value: AuthContextType = {
    user,
    session: session ? {
      user: user!,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    } : null,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updateProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// 自定义钩子：检查用户权限
export function usePermission(requiredRole: 'admin' | 'user' | 'viewer' = 'user') {
  const { user } = useAuth()
  const [hasPermission, setHasPermission] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkPermission = async () => {
      if (!user) {
        setHasPermission(false)
        setLoading(false)
        return
      }

      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (data) {
          const roleHierarchy: Record<string, number> = {
            viewer: 0,
            user: 1,
            admin: 2,
          }
          setHasPermission(roleHierarchy[data.role] >= roleHierarchy[requiredRole])
        }
      } catch (error) {
        console.error('检查权限失败:', error)
        setHasPermission(false)
      } finally {
        setLoading(false)
      }
    }

    checkPermission()
  }, [user, requiredRole, supabase])

  return { hasPermission, loading }
}