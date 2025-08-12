//! 认证和授权模块
//! 
//! 提供JWT认证和API Key验证功能

pub mod middleware;
pub mod jwt;
pub mod password;

// 重新导出常用类型
pub use jwt::Claims;
pub use middleware::ApiKeyInfo;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("无效的认证信息")]
    InvalidCredentials,
    #[error("用户未找到")]
    UserNotFound,
    #[error("Token已过期")]
    TokenExpired,
    #[error("无效的Token")]
    InvalidToken,
    #[error("API Key未找到")]
    ApiKeyNotFound,
    #[error("API Key已过期")]
    ApiKeyExpired,
    #[error("API Key无权限")]
    InsufficientPermissions,
    #[error("认证失败: {0}")]
    AuthenticationFailed(String),
    #[error("密码错误: {0}")]
    Password(String),
    #[error("账号已被锁定: {0}")]
    AccountLocked(String),
}