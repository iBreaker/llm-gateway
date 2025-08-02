/**
 * 默认系统配置 - 只保留核心必需配置
 */

import { randomBytes } from 'crypto';

/**
 * 生成随机密钥
 */
function generateRandomKey(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * 生成随机JWT密钥
 */
function generateJwtSecret(): string {
  return randomBytes(64).toString('base64url');
}

export const DEFAULT_CONFIGS = {
  // 应用基础配置
  'app.port': 13000,
  'app.log_level': 'info',
  
} as const;

/**
 * 需要随机生成的安全配置
 * 这些配置会在初始化时自动生成
 */
export const SECURITY_CONFIGS = {
  'security.jwt_secret': generateJwtSecret,
  'security.api_key_salt': () => generateRandomKey(32),
  'security.encryption_key': () => generateRandomKey(32),
} as const;

/**
 * 敏感配置键（需要加密存储）
 */
export const SENSITIVE_CONFIG_KEYS = [
  'security.jwt_secret',
  'security.api_key_salt',
  'security.encryption_key'
] as const;