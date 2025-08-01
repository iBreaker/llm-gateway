import { createClient } from '@/lib/supabase/server'
import { UserProfile, SignUpData, SignInData } from '@/types/auth'
import { User } from '@supabase/supabase-js'

export class AuthService {
  private supabase = createClient()

  // 用户注册
  async signUp(data: SignUpData) {
    const { email, password, full_name } = data

    const { data: authData, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || email.split('@')[0],
        },
      },
    })

    if (error) {
      throw new Error(`注册失败: ${error.message}`)
    }

    return authData
  }

  // 用户登录
  async signIn(data: SignInData) {
    const { email, password } = data

    const { data: authData, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(`登录失败: ${error.message}`)
    }

    return authData
  }

  // 用户登出
  async signOut() {
    const { error } = await this.supabase.auth.signOut()
    
    if (error) {
      throw new Error(`登出失败: ${error.message}`)
    }
  }

  // 重置密码
  async resetPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
    })

    if (error) {
      throw new Error(`密码重置失败: ${error.message}`)
    }
  }

  // 获取当前用户
  async getCurrentUser() {
    const { data: { user }, error } = await this.supabase.auth.getUser()

    if (error) {
      throw new Error(`获取用户信息失败: ${error.message}`)
    }

    return user
  }

  // 获取用户配置
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // 用户配置不存在，创建一个
        return await this.createUserProfile(userId)
      }
      throw new Error(`获取用户配置失败: ${error.message}`)
    }

    return data
  }

  // 创建用户配置
  async createUserProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.getCurrentUser()
    if (!user) {
      throw new Error('用户未登录')
    }

    const profileData = {
      id: userId,
      email: user.email!,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0],
      avatar_url: user.user_metadata?.avatar_url,
      role: 'user' as const,
    }

    const { data, error } = await this.supabase
      .from('user_profiles')
      .insert(profileData)
      .select()
      .single()

    if (error) {
      throw new Error(`创建用户配置失败: ${error.message}`)
    }

    return data
  }

  // 更新用户配置
  async updateUserProfile(userId: string, updates: Partial<UserProfile>) {
    const { data, error } = await this.supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      throw new Error(`更新用户配置失败: ${error.message}`)
    }

    return data
  }

  // 获取用户的上游账号
  async getUserUpstreamAccounts(userId: string) {
    const { data, error } = await this.supabase
      .from('upstream_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (error) {
      throw new Error(`获取上游账号失败: ${error.message}`)
    }

    return data
  }

  // 获取用户的 API 密钥
  async getUserApiKeys(userId: string) {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)

    if (error) {
      throw new Error(`获取API密钥失败: ${error.message}`)
    }

    return data
  }

  // 获取用户使用统计
  async getUserUsageStats(userId: string, startDate?: Date, endDate?: Date) {
    let query = this.supabase
      .from('usage_stats')
      .select('*')
      .eq('user_id', userId)

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`获取使用统计失败: ${error.message}`)
    }

    return data
  }

  // 记录用户活动
  async logUserActivity(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ) {
    const { error } = await this.supabase
      .from('user_activity_logs')
      .insert({
        user_id: userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata: metadata || {},
        ip_address: ipAddress,
        user_agent: userAgent,
      })

    if (error) {
      console.error('记录用户活动失败:', error)
      // 不抛出错误，避免影响主要功能
    }
  }

  // 验证用户权限
  async checkUserPermission(userId: string, requiredRole: 'admin' | 'user' | 'viewer' = 'user'): Promise<boolean> {
    const profile = await this.getUserProfile(userId)
    if (!profile) {
      return false
    }

    const roleHierarchy = {
      viewer: 0,
      user: 1,
      admin: 2,
    }

    return roleHierarchy[profile.role] >= roleHierarchy[requiredRole]
  }

  // 获取所有用户（仅管理员）
  async getAllUsers(currentUserId: string) {
    // 检查权限
    const hasPermission = await this.checkUserPermission(currentUserId, 'admin')
    if (!hasPermission) {
      throw new Error('权限不足')
    }

    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`获取用户列表失败: ${error.message}`)
    }

    return data
  }
}