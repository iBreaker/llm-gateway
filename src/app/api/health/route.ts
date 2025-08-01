import { NextResponse } from 'next/server'
import { checkSystemHealth } from '@/lib/server-init'

export async function GET() {
  try {
    const health = await checkSystemHealth()
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...health
    }, {
      status: health.status === 'healthy' ? 200 : 503
    })
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: `健康检查失败: ${error}`,
      timestamp: new Date().toISOString()
    }, {
      status: 500
    })
  }
}