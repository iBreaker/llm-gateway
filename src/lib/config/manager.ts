/**
 * 系统配置管理器
 * 所有配置存储在数据库中，支持缓存和动态更新
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 配置缓存
const configCache = new Map<string, { value: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取单个配置值
 */
export async function getConfig<T = any>(key: string, defaultValue?: T): Promise<T> {
  try {
    // 检查缓存
    const cached = configCache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value as T;
    }

    // 从数据库获取
    const config = await prisma.systemConfig.findUnique({
      where: { key }
    });

    const value = config?.value ?? defaultValue;
    
    // 更新缓存
    configCache.set(key, {
      value,
      expires: Date.now() + CACHE_TTL
    });

    return value as T;
  } catch (error) {
    console.error(`Failed to get config for key: ${key}`, error);
    return defaultValue as T;
  }
}

/**
 * 批量获取配置值
 */
export async function getConfigs(keys: string[]): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  
  for (const key of keys) {
    result[key] = await getConfig(key);
  }
  
  return result;
}

/**
 * 设置配置值
 */
export async function setConfig(key: string, value: any): Promise<void> {
  try {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { 
        value: value,
        updatedAt: new Date()
      },
      create: { 
        key, 
        value: value 
      }
    });

    // 清除缓存
    configCache.delete(key);
    
    console.log(`Config updated: ${key}`);
  } catch (error) {
    console.error(`Failed to set config for key: ${key}`, error);
    throw error;
  }
}

/**
 * 更新配置值 (setConfig 的别名)
 */
export const updateConfig = setConfig;

/**
 * 批量设置配置
 */
export async function setConfigs(configs: Record<string, any>): Promise<void> {
  const transaction = Object.entries(configs).map(([key, value]) =>
    prisma.systemConfig.upsert({
      where: { key },
      update: { 
        value: value,
        updatedAt: new Date()
      },
      create: { 
        key, 
        value: value 
      }
    })
  );

  try {
    await prisma.$transaction(transaction);
    
    // 清除相关缓存
    Object.keys(configs).forEach(key => configCache.delete(key));
    
    console.log(`Batch config update completed for ${Object.keys(configs).length} items`);
  } catch (error) {
    console.error('Failed to batch update configs', error);
    throw error;
  }
}

/**
 * 删除配置
 */
export async function deleteConfig(key: string): Promise<void> {
  try {
    await prisma.systemConfig.delete({
      where: { key }
    });

    // 清除缓存
    configCache.delete(key);
    
    console.log(`Config deleted: ${key}`);
  } catch (error) {
    console.error(`Failed to delete config for key: ${key}`, error);
    throw error;
  }
}

/**
 * 获取所有配置
 */
export async function getAllConfigs(): Promise<Record<string, any>> {
  try {
    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: 'asc' }
    });

    const result: Record<string, any> = {};
    configs.forEach(config => {
      result[config.key] = config.value;
    });

    return result;
  } catch (error) {
    console.error('Failed to get all configs', error);
    throw error;
  }
}

/**
 * 清除配置缓存
 */
export function clearConfigCache(): void {
  configCache.clear();
  console.log('Config cache cleared');
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: configCache.size,
    keys: Array.from(configCache.keys())
  };
}

/**
 * 配置是否存在
 */
export async function configExists(key: string): Promise<boolean> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key },
      select: { key: true }
    });
    return !!config;
  } catch (error) {
    console.error(`Failed to check config existence for key: ${key}`, error);
    return false;
  }
}