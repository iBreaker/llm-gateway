import { NextResponse } from 'next/server'

// POST /api/oauth/initiate - 已弃用的端点
export async function POST() {
  return NextResponse.json({
    error: '此端点已弃用',
    message: '请使用新的手动授权码输入模式',
    alternatives: {
      claude: '/api/oauth/generate-claude-url',
      gemini: '直接使用前端生成的 Google OAuth URL'
    }
  }, {
    status: 410 // Gone
  })
}