import { User } from '@supabase/supabase-js'

export interface AuthUser extends User {
  // 扩展用户信息
  full_name?: string
  avatar_url?: string
  role?: 'admin' | 'user' | 'viewer'
}

export interface AuthSession {
  user: AuthUser
  access_token: string
  refresh_token: string
  expires_at?: number
}

export interface SignUpData {
  email: string
  password: string
  full_name?: string
}

export interface SignInData {
  email: string
  password: string
}

export interface UserProfile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  role: 'admin' | 'user' | 'viewer'
  created_at: string
  updated_at: string
}

export interface AuthContextType {
  user: AuthUser | null
  session: AuthSession | null
  loading: boolean
  signIn: (data: SignInData) => Promise<void>
  signUp: (data: SignUpData) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateProfile: (data: Partial<UserProfile>) => Promise<void>
}