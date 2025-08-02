const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// 手动加载环境变量
function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    });
  } catch (error) {
    console.log('读取环境变量文件失败:', error.message);
  }
}

// 加载.env.local文件
loadEnvFile('.env.local');

async function testSupabaseConnection() {
  console.log('🔍 测试Supabase数据库连接...\n');
  
  // 从环境变量获取配置
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('配置信息:');
  console.log('- SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
  console.log('- SUPABASE_ANON_KEY:', supabaseKey ? '已设置' : '未设置');
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ 缺少必要的环境变量');
    return;
  }
  
  try {
    // 创建Supabase客户端
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    
    console.log('✅ Supabase客户端创建成功\n');
    
    // 测试1: 检查表是否存在（使用正确的语法）
    console.log('1. 检查表是否存在...');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(1);
      
      if (error) {
        console.log('❌ 查询users表失败:', error.message);
        console.log('   错误代码:', error.code);
        console.log('   详细信息:', error.details);
      } else {
        console.log('✅ users表查询成功，记录数:', data ? data.length : 0);
      }
    } catch (error) {
      console.log('❌ 查询users表异常:', error.message);
    }
    
    // 测试2: 尝试插入测试数据
    console.log('\n2. 尝试插入测试数据...');
    try {
      const testEmail = `test-${Date.now()}@example.com`;
      const { data, error } = await supabase
        .from('users')
        .insert({
          email: testEmail,
          username: `testuser_${Date.now()}`,
          password_hash: 'test_hash',
          role: 'user',
          is_active: true
        })
        .select()
        .single();
      
      if (error) {
        console.log('❌ 插入测试数据失败:', error.message);
        console.log('   错误代码:', error.code);
        console.log('   详细信息:', error.details);
        
        // 检查是否是RLS问题
        if (error.code === '42501') {
          console.log('   这可能是RLS（Row Level Security）策略阻止了操作');
        }
      } else {
        console.log('✅ 插入测试数据成功:', data);
        
        // 清理测试数据
        await supabase
          .from('users')
          .delete()
          .eq('email', testEmail);
        console.log('✅ 测试数据已清理');
      }
    } catch (error) {
      console.log('❌ 插入测试数据异常:', error.message);
    }
    
    // 测试3: 检查表结构
    console.log('\n3. 检查表结构...');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .limit(0);
      
      if (error) {
        console.log('❌ 检查表结构失败:', error.message);
      } else {
        console.log('✅ 表结构检查成功');
      }
    } catch (error) {
      console.log('❌ 检查表结构异常:', error.message);
    }
    
    // 测试4: 尝试使用service role key（如果有的话）
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) {
      console.log('\n4. 使用service role key测试...');
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false
          }
        });
        
        const testEmail = `admin-test-${Date.now()}@example.com`;
        const { data, error } = await supabaseAdmin
          .from('users')
          .insert({
            email: testEmail,
            username: `adminuser_${Date.now()}`,
            password_hash: 'admin_test_hash',
            role: 'user',
            is_active: true
          })
          .select()
          .single();
        
        if (error) {
          console.log('❌ 使用service role插入失败:', error.message);
        } else {
          console.log('✅ 使用service role插入成功:', data);
          
          // 清理测试数据
          await supabaseAdmin
            .from('users')
            .delete()
            .eq('email', testEmail);
          console.log('✅ admin测试数据已清理');
        }
      } catch (error) {
        console.log('❌ 使用service role测试异常:', error.message);
      }
    }
    
  } catch (error) {
    console.log('❌ 创建Supabase客户端失败:', error.message);
  }
}

// 运行测试
testSupabaseConnection().catch(console.error); 