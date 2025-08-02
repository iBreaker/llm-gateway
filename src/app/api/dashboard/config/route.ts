import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth'
import { getAllConfigs, updateConfig } from '@/lib/config'

async function handleGetConfig(request: AuthenticatedRequest) {
  try {
    const config = await getAllConfigs()
    return NextResponse.json({ config })
  } catch (error) {
    console.error('获取系统配置失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

async function handleUpdateConfig(request: AuthenticatedRequest) {
  try {
    const { config } = await request.json()
    
    // 更新每个配置项
    for (const [key, value] of Object.entries(config)) {
      await updateConfig(key, value)
    }

    return NextResponse.json({ 
      message: '配置更新成功',
      config: await getAllConfigs()
    })
  } catch (error) {
    console.error('更新系统配置失败:', error)
    return NextResponse.json(
      { message: '服务器内部错误' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGetConfig)
export const PUT = withAuth(handleUpdateConfig)