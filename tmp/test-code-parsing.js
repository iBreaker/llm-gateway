#!/usr/bin/env node

// 测试授权码解析逻辑
console.log('🔍 测试 Claude 授权码解析...\n')

// 您提供的授权码
const testCode = 'lPdi10Q0CSqqkyA2gWTBtn5LGpJXb7tI5kCbxb6LKxdxVHdj#225cdab520b89b3e33a7a0b7104901feef57088d466fef5fbe3fe3b240a193a2'

console.log('📋 原始授权码:')
console.log(testCode)
console.log('长度:', testCode.length)

// 模拟当前的解析逻辑
function parseAuthCode(code) {
  console.log('\n🔧 开始解析授权码...')
  
  // 1. 基本清理
  let actualCode = code.trim()
  console.log('1️⃣ 去除首尾空格:', actualCode)
  
  // 2. 检查是否是完整 URL（在这个例子中不是）
  if (actualCode.includes('console.anthropic.com/oauth/code/callback')) {
    console.log('2️⃣ 检测到完整 URL，提取参数...')
    try {
      const url = new URL(actualCode)
      const codeParam = url.searchParams.get('code')
      if (codeParam) {
        actualCode = codeParam
        console.log('✅ 从 URL 提取授权码:', actualCode)
      }
    } catch (error) {
      console.warn('⚠️ URL 解析失败:', error.message)
    }
  } else {
    console.log('2️⃣ 不是完整 URL，跳过 URL 解析')
  }
  
  // 3. 清理 URL fragments 和参数
  const cleanedCode = actualCode.split('#')[0]?.split('&')[0] ?? actualCode
  actualCode = cleanedCode.trim()
  console.log('3️⃣ 清理 fragments 和参数:', actualCode)
  console.log('   清理后长度:', actualCode.length)
  
  // 4. 验证格式
  const validCodePattern = /^[A-Za-z0-9_-]+$/
  const isValid = validCodePattern.test(actualCode)
  console.log('4️⃣ 格式验证:', isValid ? '✅ 通过' : '❌ 失败')
  
  if (!isValid) {
    console.log('   包含的无效字符:', actualCode.split('').filter(c => !validCodePattern.test(c)))
  }
  
  // 5. 长度验证
  const lengthValid = actualCode.length >= 10 && actualCode.length <= 500
  console.log('5️⃣ 长度验证:', lengthValid ? '✅ 通过' : '❌ 失败')
  console.log('   长度:', actualCode.length, '(范围: 10-500)')
  
  return {
    originalCode: code,
    cleanedCode: actualCode,
    isValid: isValid && lengthValid,
    length: actualCode.length
  }
}

// 执行测试
const result = parseAuthCode(testCode)

console.log('\n📊 解析结果:')
console.log('原始长度:', result.originalCode.length)
console.log('清理后长度:', result.length)
console.log('是否有效:', result.isValid ? '✅ 是' : '❌ 否')
console.log('清理后授权码:', result.cleanedCode)

// 检查被移除的部分
const removedPart = testCode.split('#')[1]
if (removedPart) {
  console.log('\n🗑️ 被移除的 fragment 部分:')
  console.log(removedPart)
  console.log('fragment 长度:', removedPart.length)
}

console.log('\n🎯 结论:')
if (result.isValid) {
  console.log('✅ 授权码解析成功，可以用于 OAuth 交换')
  console.log('🔑 最终授权码:', result.cleanedCode)
} else {
  console.log('❌ 授权码解析失败，需要检查格式')
}