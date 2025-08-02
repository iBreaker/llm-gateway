'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok) {
        // 保存 token 到 localStorage
        localStorage.setItem('token', data.token)
        router.push('/dashboard')
      } else {
        setError(data.message || '登录失败')
      }
    } catch (err) {
      setError('网络错误，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 py-12 px-4">
      <div className="max-w-sm w-full">
        <div className="bg-white border border-zinc-200 rounded-sm p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-zinc-900">
              LLM Gateway
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              登录到管理控制台
            </p>
          </div>
          
          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              label="邮箱地址"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="输入您的邮箱地址"
            />
            
            <Input
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="输入您的密码"
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-sm p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
              disabled={!email || !password}
            >
              {isLoading ? '登录中...' : '登录'}
            </Button>
          </form>
          
          <div className="text-center mt-4">
            <p className="text-xs text-zinc-500">
              LLM Gateway v1.0 - 智能大语言模型网关服务
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}