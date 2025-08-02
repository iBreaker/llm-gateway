#!/usr/bin/env ts-node

/**
 * 初始化系统默认配置脚本
 * 用于首次启动时设置所有默认配置
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_CONFIGS, SECURITY_CONFIGS } from '../src/lib/config/defaults';

const prisma = new PrismaClient();

async function initializeConfigs() {
  console.log('🚀 开始初始化系统配置...');
  
  try {
    const existingConfigs = await prisma.systemConfig.findMany({
      select: { key: true }
    });
    
    const existingKeys = new Set(existingConfigs.map(c => c.key));
    
    let createdCount = 0;
    let skippedCount = 0;
    
    // 处理常规配置
    const configEntries = Object.entries(DEFAULT_CONFIGS);
    for (const [key, value] of configEntries) {
      if (existingKeys.has(key)) {
        console.log(`⏭️  配置已存在，跳过: ${key}`);
        skippedCount++;
        continue;
      }
      
      await prisma.systemConfig.create({
        data: {
          key,
          value: value as any
        }
      });
      
      console.log(`✅ 创建配置: ${key} = ${JSON.stringify(value)}`);
      createdCount++;
    }
    
    // 处理安全配置（随机生成）
    console.log('\n🔐 生成随机安全密钥...');
    const securityEntries = Object.entries(SECURITY_CONFIGS);
    for (const [key, generator] of securityEntries) {
      if (existingKeys.has(key)) {
        console.log(`⏭️  安全配置已存在，跳过: ${key}`);
        skippedCount++;
        continue;
      }
      
      const value = generator();
      await prisma.systemConfig.create({
        data: {
          key,
          value: value as any
        }
      });
      
      // 安全配置不显示具体值，只显示长度
      console.log(`🔑 创建安全配置: ${key} (长度: ${value.length})`);
      createdCount++;
    }
    
    console.log('\n📊 初始化完成统计:');
    console.log(`  - 新创建配置: ${createdCount} 个`);
    console.log(`  - 跳过已存在: ${skippedCount} 个`);
    console.log(`  - 总配置数量: ${configEntries.length + securityEntries.length} 个`);
    
    // 验证关键配置
    console.log('\n🔍 验证关键配置...');
    const keyConfigs = [
      'app.port',
      'security.jwt_secret',
      'rate_limit.default_per_minute',
      'upstream.default_timeout'
    ];
    
    for (const key of keyConfigs) {
      const config = await prisma.systemConfig.findUnique({
        where: { key }
      });
      
      if (config) {
        console.log(`✅ ${key}: ${JSON.stringify(config.value)}`);
      } else {
        console.error(`❌ 关键配置缺失: ${key}`);
      }
    }
    
    console.log('\n🎉 系统配置初始化完成！');
    
  } catch (error) {
    console.error('❌ 配置初始化失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 添加命令行参数支持
const args = process.argv.slice(2);
const force = args.includes('--force') || args.includes('-f');
const verbose = args.includes('--verbose') || args.includes('-v');

if (force) {
  console.log('⚠️  强制模式：将覆盖现有配置');
}

if (verbose) {
  console.log('📝 详细模式：显示所有操作');
}

// 主函数
async function main() {
  try {
    if (force) {
      // 强制模式：重新创建所有配置
      console.log('🔄 强制重新初始化所有配置...');
      
      for (const [key, value] of Object.entries(DEFAULT_CONFIGS)) {
        await prisma.systemConfig.upsert({
          where: { key },
          update: { 
            value: value as any,
            updatedAt: new Date()
          },
          create: { 
            key, 
            value: value as any 
          }
        });
        
        if (verbose) {
          console.log(`🔄 更新配置: ${key}`);
        }
      }
      
      console.log('✅ 强制初始化完成');
    } else {
      // 正常模式：只创建不存在的配置
      await initializeConfigs();
    }
  } catch (error) {
    console.error('💥 初始化过程发生错误:', error);
    process.exit(1);
  }
}

// 处理命令行帮助
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📖 系统配置初始化脚本

用法:
  npm run init-config [选项]

选项:
  -f, --force     强制覆盖现有配置
  -v, --verbose   显示详细输出
  -h, --help      显示此帮助信息

示例:
  npm run init-config           # 正常初始化
  npm run init-config --force   # 强制重新初始化
  npm run init-config -fv       # 强制模式 + 详细输出
`);
  process.exit(0);
}

// 执行主函数
main();