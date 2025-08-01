import { NextResponse } from 'next/server'

// GET /api/oauth/callback - 仅用于显示说明信息
export async function GET() {
  return NextResponse.json({
    message: 'OAuth 回调端点',
    note: '此应用使用手动授权码输入模式，不需要自动回调处理',
    instructions: '请在添加账号界面手动输入授权码'
  })
}