'use client'

import { useState } from 'react'

export default function SimpleLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    console.log('🔐 简单登录被点击', { email, password: password ? '***' : '' })
    alert('登录功能正常!')
  }

  return (
    <div style={{ padding: '50px', maxWidth: '400px', margin: '0 auto' }}>
      <h1>简单登录测试</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label>邮箱:</label>
        <input 
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '10px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label>密码:</label>
        <input 
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px', marginTop: '5px' }}
        />
      </div>

      <button 
        onClick={handleClick}
        disabled={loading}
        style={{ 
          width: '100%', 
          padding: '15px', 
          backgroundColor: '#0070f3', 
          color: 'white', 
          border: 'none',
          borderRadius: '5px',
          fontSize: '16px',
          cursor: 'pointer'
        }}
      >
        {loading ? '登录中...' : '测试登录'}
      </button>

      <p style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        状态: 邮箱={email || '空'}, 密码={password ? '已输入' : '空'}
      </p>
    </div>
  )
}