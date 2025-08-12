import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { SystemSettingsProvider } from '@/contexts/SystemSettingsContext'
import MainLayout from '@/components/layout/MainLayout'
import DynamicTitle from '@/components/layout/DynamicTitle'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LLM Gateway',
  description: '智能大语言模型网关服务',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <AuthProvider>
          <SystemSettingsProvider>
            <DynamicTitle />
            <MainLayout>
              {children}
            </MainLayout>
          </SystemSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  )
}