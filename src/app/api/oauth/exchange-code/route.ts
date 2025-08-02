import { NextRequest, NextResponse } from 'next/server'
import { exchangeClaudeToken, exchangeGeminiToken, getClaudeUserInfo, getGeminiUserInfo } from '@/lib/utils/oauth-helpers'

// POST /api/oauth/exchange-code
export async function POST(request: NextRequest) {
  try {
    const { provider, code, codeVerifier, state }: { 
      provider: 'claude' | 'gemini', 
      code: string, 
      codeVerifier?: string, 
      state?: string 
    } = await request.json()

    if (!['claude', 'gemini'].includes(provider)) {
      return NextResponse.json(
        { error: '不支持的 OAuth 提供商' },
        { status: 400 }
      )
    }

    if (!code) {
      return NextResponse.json(
        { error: '授权码是必需的' },
        { status: 400 }
      )
    }

    let tokenData: any
    let userInfo: any

    try {
      if (provider === 'claude') {
        // Claude 需要 PKCE 参数
        if (!codeVerifier || !state) {
          return NextResponse.json({
            error: 'Claude OAuth 需要 PKCE 参数',
            message: '缺少必需的 codeVerifier 或 state 参数',
            suggestion: 'regenerate_url'
          }, {
            status: 400
          })
        }

        // 解析并清理授权码
        let actualCode = code.trim()
        
        console.log('🔍 原始授权码:', actualCode)
        
        // 如果用户输入的是完整的回调 URL，提取其中的授权码
        if (actualCode.includes('console.anthropic.com/oauth/code/callback')) {
          try {
            const url = new URL(actualCode)
            const codeParam = url.searchParams.get('code')
            if (codeParam) {
              actualCode = codeParam
              console.log('✅ 从 URL 提取授权码:', actualCode)
            }
          } catch (error) {
            console.warn('⚠️ URL 解析失败，尝试其他方法:', error)
          }
        }
        
        // 清理授权码：移除 URL fragments 和额外参数
        const cleanedCode = actualCode.split('#')[0]?.split('&')[0] ?? actualCode
        actualCode = cleanedCode.trim()
        
        console.log('🧹 清理后的授权码:', actualCode)
        
        // 基本格式验证：授权码应该只包含字母、数字、下划线、连字符
        const validCodePattern = /^[A-Za-z0-9_-]+$/
        if (!validCodePattern.test(actualCode)) {
          throw new Error('授权码包含无效字符，请检查是否复制了正确的 Authorization Code')
        }
        
        // 验证授权码长度
        if (actualCode.length < 10 || actualCode.length > 500) {
          throw new Error(`授权码长度无效 (${actualCode.length} 字符)，请检查是否完整复制了授权码`)
        }
        
        console.log('✅ 授权码验证通过，长度:', actualCode.length)

        // 使用 PKCE 参数交换 Token，使用固定的 Claude 回调 URI
        tokenData = await exchangeClaudeToken(actualCode, codeVerifier, 'https://console.anthropic.com/oauth/code/callback', state)
        userInfo = await getClaudeUserInfo(tokenData.access_token)
      } else if (provider === 'gemini') {
        tokenData = await exchangeGeminiToken(code, 'urn:ietf:wg:oauth:2.0:oob')
        userInfo = await getGeminiUserInfo(tokenData.access_token)
      }

      return NextResponse.json({
        success: true,
        data: {
          provider,
          email: userInfo.email,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_in: tokenData.expires_in
        }
      })
    } catch (tokenError) {
      console.error('❌ OAuth token exchange failed:', tokenError)
      
      // 尝试解析错误信息
      let errorMessage = 'Token exchange failed'
      let errorDetails = ''
      
      if (tokenError instanceof Error) {
        errorMessage = tokenError.message
        
        // 检查是否是 JSON 解析错误
        if (errorMessage.includes('Unexpected token') || errorMessage.includes('not valid JSON')) {
          errorDetails = '服务器返回了非 JSON 格式的响应，可能是授权码无效或已过期'
        }
        // 检查是否是网络错误
        else if (errorMessage.includes('fetch')) {
          errorDetails = '网络请求失败，请检查网络连接'
        }
        // 检查是否是 Claude 特定错误
        else if (errorMessage.includes('Claude OAuth token exchange failed')) {
          errorDetails = 'Claude OAuth 服务器拒绝了请求，请检查授权码是否正确且未过期'
        }
      }
      
      return NextResponse.json({
        error: 'Token 交换失败',
        message: errorMessage,
        details: errorDetails || (provider === 'claude' 
          ? '请确保授权码正确且未过期，或尝试使用手动输入模式'
          : '请检查授权码是否正确'),
        provider,
        timestamp: new Date().toISOString()
      }, {
        status: 400
      })
    }
  } catch (error) {
    console.error('OAuth code exchange error:', error)
    
    return NextResponse.json({
      error: '授权码交换失败',
      message: error instanceof Error ? error.message : '未知错误'
    }, {
      status: 500
    })
  }
}