//! 密码处理模块

use bcrypt::{hash, verify, DEFAULT_COST};
use super::AuthError;

/// 哈希密码
pub fn hash_password(password: &str) -> Result<String, AuthError> {
    hash(password, DEFAULT_COST)
        .map_err(|e| AuthError::AuthenticationFailed(format!("密码哈希失败: {}", e)))
}

/// 验证密码
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AuthError> {
    verify(password, hash)
        .map_err(|e| AuthError::AuthenticationFailed(format!("密码验证失败: {}", e)))
}