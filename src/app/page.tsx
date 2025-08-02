import { redirect } from 'next/navigation'

export default function HomePage() {
  // 首页直接重定向到登录页面
  redirect('/auth/login')
}