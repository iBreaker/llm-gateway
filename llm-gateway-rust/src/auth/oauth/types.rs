//! OAuth 相关类型定义

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// OAuth 提供商类型（内部使用）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OAuthProviderType {
    Anthropic,
    Gemini,
    Qwen,
}

/// OAuth 提供商（对外API使用）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum OAuthProvider {
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "qwen")]
    Qwen,
}

impl std::fmt::Display for OAuthProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OAuthProvider::Anthropic => write!(f, "anthropic"),
            OAuthProvider::Gemini => write!(f, "gemini"),
            OAuthProvider::Qwen => write!(f, "qwen"),
        }
    }
}

impl std::str::FromStr for OAuthProvider {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "anthropic" => Ok(OAuthProvider::Anthropic),
            "gemini" => Ok(OAuthProvider::Gemini),
            "qwen" => Ok(OAuthProvider::Qwen),
            _ => Err(format!("不支持的OAuth提供商: {}", s)),
        }
    }
}

/// 代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub r#type: String, // http, https, socks5
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// OAuth 授权参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthParams {
    pub auth_url: String,
    pub code_verifier: String,
    pub state: String,
    pub code_challenge: String,
}

/// Token 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64, // Unix timestamp in milliseconds
    pub scopes: Vec<String>,
    pub is_max: bool,
}

/// OAuth 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthSession {
    pub session_id: String,
    pub provider: OAuthProvider,
    pub code_verifier: String,
    pub state: String,
    pub code_challenge: String,
    pub session_type: String, // "oauth" or "setup-token"
    pub expires_at: i64, // Unix timestamp in milliseconds
    pub proxy: Option<ProxyConfig>,
    pub extra_params: HashMap<String, serde_json::Value>, // 提供商特定的额外参数
}

/// Anthropic OAuth 常量
pub struct OAuthConfig;

impl OAuthConfig {
    pub const AUTHORIZE_URL: &'static str = "https://claude.ai/oauth/authorize";
    pub const TOKEN_URL: &'static str = "https://console.anthropic.com/v1/oauth/token";
    pub const CLIENT_ID: &'static str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
    pub const REDIRECT_URI: &'static str = "https://console.anthropic.com/oauth/code/callback";
    pub const SCOPES: &'static str = "org:create_api_key user:profile user:inference";
    pub const SCOPES_SETUP: &'static str = "user:inference";
    pub const SESSION_TIMEOUT_MINUTES: i64 = 30;
}

/// OAuth 错误类型
#[derive(Debug, thiserror::Error)]
pub enum OAuthError {
    #[error("网络请求失败: {0}")]
    NetworkError(#[from] reqwest::Error),
    
    #[error("JSON 解析失败: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("URL 解析失败: {0}")]
    UrlError(#[from] url::ParseError),
    
    #[error("会话不存在或已过期")]
    SessionNotFound,
    
    #[error("会话已过期")]
    SessionExpired,
    
    #[error("授权码格式无效: {0}")]
    InvalidAuthCode(String),
    
    #[error("Token 交换失败: {0}")]
    TokenExchangeFailed(String),
    
    #[error("Token 刷新失败: {0}")]
    TokenRefreshFailed(String),
    
    #[error("缓存操作失败: {0}")]
    CacheError(String),
}