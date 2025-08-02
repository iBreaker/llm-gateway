const https = require('https');

// 测试函数
async function testApiKeys() {
  const baseUrl = 'https://llm-gateway.aigine.fun';
  
  console.log('🔍 开始测试API密钥创建功能...\n');
  
  // 1. 检查数据库状态
  console.log('1. 检查数据库状态...');
  try {
    const checkResponse = await makeRequest(`${baseUrl}/api/debug/check-tables`, 'GET');
    console.log('✅ 数据库状态:', JSON.stringify(checkResponse, null, 2));
  } catch (error) {
    console.log('❌ 检查数据库状态失败:', error.message);
  }
  
  // 2. 创建测试用户
  console.log('\n2. 创建测试用户...');
  try {
    const testUserResponse = await makeRequest(`${baseUrl}/api/debug/test-crud`, 'GET');
    console.log('✅ 测试用户创建结果:', JSON.stringify(testUserResponse, null, 2));
  } catch (error) {
    console.log('❌ 创建测试用户失败:', error.message);
  }
  
  // 3. 尝试创建API密钥（需要认证）
  console.log('\n3. 尝试创建API密钥（需要认证）...');
  try {
    const apiKeyResponse = await makeRequest(`${baseUrl}/api/dashboard/api-keys/create`, 'POST', {
      name: '测试API密钥',
      description: '用于测试的API密钥'
    }, {
      'x-user-email': 'test@example.com'
    });
    console.log('✅ API密钥创建结果:', JSON.stringify(apiKeyResponse, null, 2));
  } catch (error) {
    console.log('❌ API密钥创建失败:', error.message);
    console.log('   这是因为需要用户登录认证');
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
testApiKeys().catch(console.error); 