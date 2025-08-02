const https = require('https');

// 测试API密钥创建
async function testApiKeyCreation() {
  const baseUrl = 'https://llm-gateway.aigine.fun';
  
  console.log('🔍 测试API密钥创建功能...\n');
  
  // 1. 首先检查数据库状态
  console.log('1. 检查数据库状态...');
  try {
    const checkResponse = await makeRequest(`${baseUrl}/api/debug/check-tables`, 'GET');
    console.log('✅ 数据库状态:', JSON.stringify(checkResponse, null, 2));
  } catch (error) {
    console.log('❌ 检查数据库状态失败:', error.message);
  }
  
  // 2. 尝试创建API密钥（需要认证）
  console.log('\n2. 尝试创建API密钥...');
  try {
    const apiKeyResponse = await makeRequest(`${baseUrl}/api/dashboard/api-keys/create`, 'POST', {
      name: '测试API密钥',
      description: '用于测试的API密钥'
    }, {
      'x-user-email': 'test@example.com',
      'x-user-id': 'test-user-id'
    });
    console.log('✅ API密钥创建结果:', JSON.stringify(apiKeyResponse, null, 2));
  } catch (error) {
    console.log('❌ API密钥创建失败:', error.message);
    
    // 如果是重定向错误，说明需要登录
    if (error.message.includes('307') || error.message.includes('Redirecting')) {
      console.log('   这是因为需要用户登录认证');
      console.log('   请先登录系统，然后再尝试创建API密钥');
    }
  }
  
  console.log('\n🎉 测试完成！');
}

// HTTP请求辅助函数
function makeRequest(url, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      const postData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const jsonData = JSON.parse(responseData);
            resolve(jsonData);
          } else if (res.statusCode === 307) {
            // 处理重定向
            reject(new Error(`HTTP ${res.statusCode}: Redirecting to ${res.headers.location}`));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        } catch (error) {
          reject(new Error(`解析响应失败: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// 运行测试
testApiKeyCreation().catch(console.error); 