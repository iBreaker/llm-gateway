#!/usr/bin/env node

/**
 * 创建演示数据的脚本
 */

const Database = require('better-sqlite3');
const path = require('path');

async function seedDemoData() {
  const dbPath = path.join(__dirname, '../data/app.db');
  const db = new Database(dbPath);

  console.log('🌱 开始创建演示数据...');

  try {
    // 开始事务
    db.exec('BEGIN TRANSACTION');

    // 创建示例用户
    const userInsert = db.prepare(`
      INSERT INTO users (email, username, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const users = [
      ['admin@example.com', 'admin', 'hashed_password_123', 'admin', 1],
      ['user1@example.com', 'user1', 'hashed_password_456', 'user', 1],
      ['user2@example.com', 'user2', 'hashed_password_789', 'user', 1],
    ];

    users.forEach(user => userInsert.run(...user));
    console.log('✅ 创建了 3 个示例用户');

    // 创建示例上游账号
    const accountInsert = db.prepare(`
      INSERT INTO upstream_accounts (type, email, credentials, is_active, priority, weight, request_count, success_count, error_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const accounts = [
      ['openai', 'account1@openai.com', '{"api_key":"sk-xxx1"}', 1, 1, 100, 2543, 2512, 31],
      ['openai', 'account2@openai.com', '{"api_key":"sk-xxx2"}', 1, 1, 100, 3421, 3401, 20],
      ['anthropic', 'account1@anthropic.com', '{"api_key":"ant-xxx1"}', 1, 2, 80, 1876, 1869, 7],
      ['anthropic', 'account2@anthropic.com', '{"api_key":"ant-xxx2"}', 1, 2, 80, 1654, 1644, 10],
      ['google', 'account1@google.com', '{"api_key":"goog-xxx1"}', 1, 3, 60, 987, 982, 5],
      ['google', 'account2@google.com', '{"api_key":"goog-xxx2"}', 0, 3, 60, 0, 0, 0], // 非活跃
      ['openai', 'account3@openai.com', '{"api_key":"sk-xxx3"}', 1, 1, 100, 1543, 1532, 11],
      ['anthropic', 'account3@anthropic.com', '{"api_key":"ant-xxx3"}', 1, 2, 80, 1234, 1224, 10],
    ];

    accounts.forEach(account => accountInsert.run(...account));
    console.log('✅ 创建了 8 个示例上游账号 (7个活跃)');

    // 创建示例 API 密钥
    const apiKeyInsert = db.prepare(`
      INSERT INTO api_keys (user_id, name, key_hash, permissions, is_active, expires_at, request_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const apiKeys = [
      [1, 'Admin Key 1', 'hash_admin_key_1', '["read", "write", "admin"]', 1, null, 5432],
      [1, 'Admin Key 2', 'hash_admin_key_2', '["read", "write"]', 1, null, 2341],
      [2, 'User1 Key 1', 'hash_user1_key_1', '["read", "write"]', 1, null, 3456],
      [2, 'User1 Key 2', 'hash_user1_key_2', '["read"]', 1, null, 1876],
      [3, 'User2 Key 1', 'hash_user2_key_1', '["read", "write"]', 1, null, 987],
      [3, 'User2 Key 2', 'hash_user2_key_2', '["read"]', 0, null, 0], // 非活跃
    ];

    apiKeys.forEach(key => apiKeyInsert.run(...key));
    console.log('✅ 创建了 6 个示例 API 密钥 (5个活跃)');

    // 创建示例使用记录
    const usageInsert = db.prepare(`
      INSERT INTO usage_records (api_key_id, upstream_account_id, request_id, method, endpoint, status_code, response_time, tokens_used, cost, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'))
    `);

    // 生成最近7天的使用记录
    let totalRecords = 0;
    const endpoints = ['/v1/chat/completions', '/v1/completions', '/v1/embeddings'];
    const methods = ['POST'];
    
    for (let day = 0; day < 7; day++) {
      const recordsPerDay = 150 + Math.floor(Math.random() * 100); // 每天150-250条记录
      
      for (let i = 0; i < recordsPerDay; i++) {
        const apiKeyId = Math.floor(Math.random() * 5) + 1; // 1-5
        const upstreamAccountId = Math.floor(Math.random() * 7) + 1; // 1-7 (排除非活跃的)
        const requestId = `req_${Date.now()}_${totalRecords}_${Math.random().toString(36).substr(2, 9)}`;
        const method = methods[Math.floor(Math.random() * methods.length)];
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        
        // 模拟真实的响应状态
        const isSuccess = Math.random() > 0.02; // 98% 成功率
        const statusCode = isSuccess ? 200 : (Math.random() > 0.5 ? 429 : 500);
        const responseTime = isSuccess ? 150 + Math.floor(Math.random() * 300) : Math.floor(Math.random() * 1000) + 500;
        const tokensUsed = isSuccess ? Math.floor(Math.random() * 2000) + 100 : 0;
        const cost = isSuccess ? (tokensUsed * 0.0001 + Math.random() * 0.01) : 0;
        const errorMessage = isSuccess ? null : (statusCode === 429 ? 'Rate limit exceeded' : 'Internal server error');
        
        const hoursAgo = day * 24 + Math.floor(Math.random() * 24);
        
        usageInsert.run(
          apiKeyId, upstreamAccountId, requestId, method, endpoint,
          statusCode, responseTime, tokensUsed, cost, errorMessage, hoursAgo
        );
        
        totalRecords++;
      }
    }

    console.log(`✅ 创建了 ${totalRecords} 条示例使用记录`);

    // 提交事务
    db.exec('COMMIT');
    
    console.log('🎉 演示数据创建完成!');
    
    // 显示统计信息
    const stats = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      activeAccounts: db.prepare('SELECT COUNT(*) as count FROM upstream_accounts WHERE is_active = 1').get().count,
      apiKeys: db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get().count,
      usageRecords: db.prepare('SELECT COUNT(*) as count FROM usage_records').get().count,
      avgResponseTime: db.prepare('SELECT AVG(response_time) as avg FROM usage_records WHERE response_time IS NOT NULL').get().avg,
      totalCost: db.prepare('SELECT SUM(cost) as sum FROM usage_records').get().sum,
      successRate: db.prepare('SELECT (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM usage_records)) as rate FROM usage_records WHERE status_code = 200').get().rate
    };
    
    console.log('\n📊 数据库统计:');
    console.log(`- 用户数: ${stats.users}`);
    console.log(`- 活跃账号数: ${stats.activeAccounts}`);
    console.log(`- 活跃 API 密钥: ${stats.apiKeys}`);
    console.log(`- 使用记录: ${stats.usageRecords}`);
    console.log(`- 平均响应时间: ${Math.round(stats.avgResponseTime)}ms`);
    console.log(`- 总成本: $${stats.totalCost.toFixed(2)}`);
    console.log(`- 成功率: ${stats.successRate.toFixed(1)}%`);

  } catch (error) {
    console.error('❌ 创建演示数据失败:', error);
    db.exec('ROLLBACK');
    process.exit(1);
  } finally {
    db.close();
  }
}

// 检查是否直接运行此脚本
if (require.main === module) {
  seedDemoData().catch(console.error);
}

module.exports = { seedDemoData };