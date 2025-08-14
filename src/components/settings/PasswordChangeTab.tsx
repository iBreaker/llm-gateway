'use client'

import { useState } from 'react'
import { Eye, EyeOff, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { apiClient } from '@/utils/api'

interface PasswordStrength {
  score: number
  feedback: string[]
  color: string
}

export default function PasswordChangeTab() {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | null, text: string }>({ type: null, text: '' })

  // 密码强度检查
  const checkPasswordStrength = (password: string): PasswordStrength => {
    const feedback: string[] = []
    let score = 0
    
    if (password.length >= 8) {
      score += 1
    } else {
      feedback.push('至少8个字符')
    }
    
    if (/[a-z]/.test(password)) {
      score += 1
    } else {
      feedback.push('包含小写字母')
    }
    
    if (/[A-Z]/.test(password)) {
      score += 1
    } else {
      feedback.push('包含大写字母')
    }
    
    if (/\d/.test(password)) {
      score += 1
    } else {
      feedback.push('包含数字')
    }
    
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 1
    } else {
      feedback.push('包含特殊字符')
    }
    
    let color = 'red'
    if (score >= 4) color = 'green'
    else if (score >= 3) color = 'yellow'
    else if (score >= 2) color = 'orange'
    
    return { score, feedback, color }
  }

  const passwordStrength = checkPasswordStrength(formData.newPassword)

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // 清除之前的消息
    if (message.type) {
      setMessage({ type: null, text: '' })
    }
  }

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 前端验证
    if (!formData.currentPassword) {
      setMessage({ type: 'error', text: '请输入当前密码' })
      return
    }
    
    if (!formData.newPassword) {
      setMessage({ type: 'error', text: '请输入新密码' })
      return
    }
    
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({ type: 'error', text: '新密码与确认密码不匹配' })
      return
    }
    
    if (passwordStrength.score < 3) {
      setMessage({ type: 'error', text: '新密码强度不足，请按提示完善' })
      return
    }
    
    if (formData.currentPassword === formData.newPassword) {
      setMessage({ type: 'error', text: '新密码不能与当前密码相同' })
      return
    }

    try {
      setIsSubmitting(true)
      
      await apiClient.post('/api/auth/change-password', {
        oldPassword: formData.currentPassword,
        newPassword: formData.newPassword
      })
      
      setMessage({ type: 'success', text: '密码修改成功！' })
      
      // 清空表单
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      
      // 3秒后清除成功消息
      setTimeout(() => {
        setMessage({ type: null, text: '' })
      }, 3000)
      
    } catch (error: any) {
      console.error('密码修改失败:', error)
      setMessage({ 
        type: 'error', 
        text: error.message || '密码修改失败，请检查当前密码是否正确' 
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">修改密码</h2>
      
      <div className="bg-blue-50 border border-blue-200 rounded-sm p-4 mb-6">
        <div className="flex items-start">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">安全提示</p>
            <ul className="text-blue-700 space-y-1">
              <li>• 建议使用强密码，包含大小写字母、数字和特殊字符</li>
              <li>• 密码修改后，您需要重新登录</li>
              <li>• 请妥善保管新密码，避免泄露</li>
            </ul>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 当前密码 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            当前密码 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPasswords.current ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => handleInputChange('currentPassword', e.target.value)}
              className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
              placeholder="请输入当前密码"
              required
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('current')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600"
            >
              {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 新密码 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            新密码 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPasswords.new ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => handleInputChange('newPassword', e.target.value)}
              className="w-full px-3 py-2 pr-10 border border-zinc-300 rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500"
              placeholder="请输入新密码"
              required
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('new')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600"
            >
              {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          
          {/* 密码强度指示器 */}
          {formData.newPassword && (
            <div className="mt-2">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-xs text-zinc-600">密码强度:</span>
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-6 h-2 rounded-full ${
                        level <= passwordStrength.score
                          ? passwordStrength.color === 'red' ? 'bg-red-500' :
                            passwordStrength.color === 'orange' ? 'bg-orange-500' :
                            passwordStrength.color === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'
                          : 'bg-zinc-200'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium ${
                  passwordStrength.color === 'red' ? 'text-red-600' :
                  passwordStrength.color === 'orange' ? 'text-orange-600' :
                  passwordStrength.color === 'yellow' ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {passwordStrength.score < 2 ? '弱' : 
                   passwordStrength.score < 3 ? '中等' :
                   passwordStrength.score < 4 ? '强' : '很强'}
                </span>
              </div>
              {passwordStrength.feedback.length > 0 && (
                <div className="text-xs text-zinc-600">
                  <span>建议: {passwordStrength.feedback.join('、')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 确认密码 */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            确认新密码 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showPasswords.confirm ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className={`w-full px-3 py-2 pr-10 border rounded-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 focus:border-zinc-500 ${
                formData.confirmPassword && formData.newPassword !== formData.confirmPassword
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-zinc-300'
              }`}
              placeholder="请再次输入新密码"
              required
            />
            <button
              type="button"
              onClick={() => togglePasswordVisibility('confirm')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600"
            >
              {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">密码不匹配</p>
          )}
        </div>

        {/* 提交按钮和消息 */}
        <div className="pt-4 border-t border-zinc-200">
          {message.type && (
            <div className={`flex items-center px-4 py-3 rounded-sm mb-4 ${
              message.type === 'success' 
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="w-4 h-4 mr-2" />
              ) : (
                <AlertCircle className="w-4 h-4 mr-2" />
              )}
              <span className="text-sm">{message.text}</span>
            </div>
          )}
          
          <button
            type="submit"
            disabled={isSubmitting || !formData.currentPassword || !formData.newPassword || !formData.confirmPassword || formData.newPassword !== formData.confirmPassword}
            className="px-6 py-2 bg-zinc-900 text-white text-sm font-medium rounded-sm hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? '修改中...' : '修改密码'}
          </button>
        </div>
      </form>
    </div>
  )
}