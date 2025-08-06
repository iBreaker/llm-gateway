'use client'

export default function DebugPage() {
  console.log('🐛 DebugPage: 调试页面渲染')
  
  return (
    <div style={{ 
      minHeight: '100vh', 
      padding: '20px',
      backgroundColor: '#f0f0f0',
      color: '#333'
    }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>调试页面</h1>
      <p>如果你能看到这个页面，说明 React 渲染正常。</p>
      <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h2>当前时间：{new Date().toLocaleString()}</h2>
        <p>路径：/debug</p>
        <p>环境：{process.env.NODE_ENV}</p>
      </div>
    </div>
  )
}