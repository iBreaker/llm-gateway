//! OAuth 认证模块
//! 
//! 通用 OAuth 框架，支持多个提供商：Anthropic、Gemini、Qwen等
//! 提供统一的接口和可扩展的架构

pub mod core;
pub mod providers;
pub mod session;
pub mod types;
pub mod manager;

// OAuth模块导出 - 避免命名冲突
pub use core::OAuthProvider as OAuthProviderTrait;
pub use session::OAuthSessionManager;
pub use types::*;
pub use manager::OAuthManager;