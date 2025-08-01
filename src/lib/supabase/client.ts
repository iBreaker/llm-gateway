import { createBrowserClient } from '@supabase/ssr'

// 客户端组件使用的 Supabase 客户端
export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// 向后兼容的导出
export const supabase = createClient()