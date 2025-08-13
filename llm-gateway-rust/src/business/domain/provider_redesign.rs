//! 重新设计的提供商和认证架构
//! 
//! 分离服务提供商和认证方式，避免概念混乱

use serde::{Deserialize, Serialize};

/// 服务提供商
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceProvider {
    Anthropic,
    OpenAi,
    Gemini,
    Qwen,
    // 未来可以轻松添加新提供商：AWS, Azure, etc.
}

/// 认证方式
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    ApiKey,     // 传统API Key认证
    OAuth,      // OAuth2.0认证
    // 未来可能的认证方式：JWT, ServiceAccount, etc.
}

/// 账号提供商配置（组合服务提供商和认证方式）
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AccountProvider {
    pub service: ServiceProvider,
    pub auth_method: AuthMethod,
}

impl AccountProvider {
    /// 创建新的账号提供商配置
    pub fn new(service: ServiceProvider, auth_method: AuthMethod) -> Self {
        Self { service, auth_method }
    }
    
    /// 便捷创建方法
    pub fn anthropic_api() -> Self {
        Self::new(ServiceProvider::Anthropic, AuthMethod::ApiKey)
    }
    
    pub fn anthropic_oauth() -> Self {
        Self::new(ServiceProvider::Anthropic, AuthMethod::OAuth)
    }
    
    pub fn openai_api() -> Self {
        Self::new(ServiceProvider::OpenAi, AuthMethod::ApiKey)
    }
    
    pub fn gemini_api() -> Self {
        Self::new(ServiceProvider::Gemini, AuthMethod::ApiKey)
    }
    
    pub fn gemini_oauth() -> Self {
        Self::new(ServiceProvider::Gemini, AuthMethod::OAuth)
    }
    
    /// 获取字符串标识符
    pub fn as_str(&self) -> String {
        format!("{}_{}", self.service.as_str(), self.auth_method.as_str())
    }
    
    /// 从字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        let parts: Vec<&str> = s.split('_').collect();
        if parts.len() != 2 {
            return None;
        }
        
        let service = ServiceProvider::from_str(parts[0])?;
        let auth_method = AuthMethod::from_str(parts[1])?;
        
        Some(Self::new(service, auth_method))
    }
    
    /// 获取显示名称
    pub fn display_name(&self) -> String {
        format!("{} ({})", self.service.display_name(), self.auth_method.display_name())
    }
    
    /// 判断是否为OAuth类型
    pub fn is_oauth(&self) -> bool {
        self.auth_method == AuthMethod::OAuth
    }
    
    /// 获取默认base URL
    pub fn default_base_url(&self) -> Option<&'static str> {
        match (&self.service, &self.auth_method) {
            (ServiceProvider::Anthropic, AuthMethod::ApiKey) => Some("https://api.anthropic.com/v1"),
            (ServiceProvider::Anthropic, AuthMethod::OAuth) => Some("https://api.anthropic.com"),
            (ServiceProvider::OpenAi, _) => Some("https://api.openai.com/v1"),
            (ServiceProvider::Gemini, _) => Some("https://generativelanguage.googleapis.com/v1"),
            _ => None,
        }
    }
}

impl ServiceProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            ServiceProvider::Anthropic => "anthropic",
            ServiceProvider::OpenAi => "openai",
            ServiceProvider::Gemini => "gemini",
            ServiceProvider::Qwen => "qwen",
        }
    }
    
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "anthropic" => Some(ServiceProvider::Anthropic),
            "openai" => Some(ServiceProvider::OpenAi),
            "gemini" => Some(ServiceProvider::Gemini),
            "qwen" => Some(ServiceProvider::Qwen),
            _ => None,
        }
    }
    
    pub fn display_name(&self) -> &'static str {
        match self {
            ServiceProvider::Anthropic => "Anthropic",
            ServiceProvider::OpenAi => "OpenAI",
            ServiceProvider::Gemini => "Google Gemini",
            ServiceProvider::Qwen => "Alibaba Qwen",
        }
    }
}

impl AuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMethod::ApiKey => "api",
            AuthMethod::OAuth => "oauth",
        }
    }
    
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "api" => Some(AuthMethod::ApiKey),
            "oauth" => Some(AuthMethod::OAuth),
            _ => None,
        }
    }
    
    pub fn display_name(&self) -> &'static str {
        match self {
            AuthMethod::ApiKey => "API Key",
            AuthMethod::OAuth => "OAuth",
        }
    }
}

// 用于向后兼容的转换
impl From<crate::business::domain::AccountProvider> for AccountProvider {
    fn from(old_provider: crate::business::domain::AccountProvider) -> Self {
        match old_provider {
            crate::business::domain::AccountProvider::AnthropicApi => AccountProvider::anthropic_api(),
            crate::business::domain::AccountProvider::AnthropicOauth => AccountProvider::anthropic_oauth(),
            crate::business::domain::AccountProvider::OpenAi => AccountProvider::openai_api(),
            crate::business::domain::AccountProvider::Gemini => AccountProvider::gemini_api(),
            crate::business::domain::AccountProvider::GeminiOauth => AccountProvider::gemini_oauth(),
            crate::business::domain::AccountProvider::QwenOauth => AccountProvider::new(ServiceProvider::Qwen, AuthMethod::OAuth),
        }
    }
}