//! 重新设计的提供商类型系统
//! 
//! 彻底分离服务提供商和认证方式

use serde::{Deserialize, Serialize};

/// 服务提供商
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServiceProvider {
    Anthropic,
    OpenAI,
    Gemini,
    Qwen,
}

impl std::fmt::Display for ServiceProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl ServiceProvider {
    /// 获取字符串标识符
    pub fn as_str(&self) -> &'static str {
        match self {
            ServiceProvider::Anthropic => "anthropic",
            ServiceProvider::OpenAI => "openai", 
            ServiceProvider::Gemini => "gemini",
            ServiceProvider::Qwen => "qwen",
        }
    }
    
    /// 从字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "anthropic" => Some(ServiceProvider::Anthropic),
            "openai" => Some(ServiceProvider::OpenAI),
            "gemini" => Some(ServiceProvider::Gemini),
            "qwen" => Some(ServiceProvider::Qwen),
            _ => None,
        }
    }
    
    /// 获取显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            ServiceProvider::Anthropic => "Anthropic",
            ServiceProvider::OpenAI => "OpenAI",
            ServiceProvider::Gemini => "Google Gemini",
            ServiceProvider::Qwen => "Alibaba Qwen",
        }
    }
    
    /// 获取默认Base URL
    pub fn default_base_url(&self, auth_method: &AuthMethod) -> &'static str {
        match (self, auth_method) {
            (ServiceProvider::Anthropic, AuthMethod::ApiKey) => "https://api.anthropic.com/v1",
            (ServiceProvider::Anthropic, AuthMethod::OAuth) => "https://api.anthropic.com",
            (ServiceProvider::OpenAI, _) => "https://api.openai.com/v1",
            (ServiceProvider::Gemini, _) => "https://generativelanguage.googleapis.com/v1",
            (ServiceProvider::Qwen, _) => "https://dashscope.aliyuncs.com/api/v1",
        }
    }
}

/// 认证方式
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    ApiKey,
    OAuth,
}

impl std::fmt::Display for AuthMethod {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl AuthMethod {
    /// 获取字符串标识符
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMethod::ApiKey => "api_key",
            AuthMethod::OAuth => "oauth",
        }
    }
    
    /// 从字符串解析
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "api_key" | "apikey" | "api" => Some(AuthMethod::ApiKey),
            "oauth" | "oauth2" => Some(AuthMethod::OAuth),
            _ => None,
        }
    }
    
    /// 获取显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            AuthMethod::ApiKey => "API Key",
            AuthMethod::OAuth => "OAuth 2.0",
        }
    }
}

/// 提供商配置（组合服务提供商和认证方式）
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub service: ServiceProvider,
    pub auth_method: AuthMethod,
}

impl ProviderConfig {
    /// 创建新的提供商配置
    pub fn new(service: ServiceProvider, auth_method: AuthMethod) -> Self {
        Self { service, auth_method }
    }

    /// 获取服务提供商
    pub fn service_provider(&self) -> &ServiceProvider {
        &self.service
    }

    /// 获取认证方式
    pub fn auth_method(&self) -> &AuthMethod {
        &self.auth_method
    }

    /// 从数据库字段创建配置
    pub fn from_database_fields(service_provider: &str, auth_method: &str) -> Result<Self, String> {
        let service = match service_provider.to_lowercase().as_str() {
            "anthropic" => ServiceProvider::Anthropic,
            "openai" => ServiceProvider::OpenAI,
            "gemini" => ServiceProvider::Gemini,
            "qwen" => ServiceProvider::Qwen,
            _ => return Err(format!("Unknown service provider: {}", service_provider)),
        };

        let auth = match auth_method.to_lowercase().as_str() {
            "api_key" => AuthMethod::ApiKey,
            "oauth" => AuthMethod::OAuth,
            _ => return Err(format!("Unknown auth method: {}", auth_method)),
        };

        Ok(Self::new(service, auth))
    }
    
    /// 便捷创建方法
    pub fn anthropic_api() -> Self {
        Self::new(ServiceProvider::Anthropic, AuthMethod::ApiKey)
    }
    
    pub fn anthropic_oauth() -> Self {
        Self::new(ServiceProvider::Anthropic, AuthMethod::OAuth)
    }
    
    pub fn openai_api() -> Self {
        Self::new(ServiceProvider::OpenAI, AuthMethod::ApiKey)
    }
    
    pub fn gemini_api() -> Self {
        Self::new(ServiceProvider::Gemini, AuthMethod::ApiKey)
    }
    
    pub fn gemini_oauth() -> Self {
        Self::new(ServiceProvider::Gemini, AuthMethod::OAuth)
    }
    
    pub fn qwen_oauth() -> Self {
        Self::new(ServiceProvider::Qwen, AuthMethod::OAuth)
    }
    
    /// 获取组合标识符
    pub fn identifier(&self) -> String {
        format!("{}_{}", self.service.as_str(), self.auth_method.as_str())
    }
    
    /// 从标识符解析
    pub fn from_identifier(s: &str) -> Option<Self> {
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
        format!("{} ({})", 
                self.service.display_name(), 
                self.auth_method.display_name())
    }
    
    /// 判断是否为OAuth类型
    pub fn is_oauth(&self) -> bool {
        self.auth_method == AuthMethod::OAuth
    }
    
    /// 获取默认Base URL
    pub fn default_base_url(&self) -> &'static str {
        self.service.default_base_url(&self.auth_method)
    }
    
    /// 检查是否支持该配置组合
    pub fn is_supported(&self) -> bool {
        match (&self.service, &self.auth_method) {
            // Anthropic 支持两种认证方式
            (ServiceProvider::Anthropic, AuthMethod::ApiKey) => true,
            (ServiceProvider::Anthropic, AuthMethod::OAuth) => true,
            
            // OpenAI 目前只支持API Key
            (ServiceProvider::OpenAI, AuthMethod::ApiKey) => true,
            (ServiceProvider::OpenAI, AuthMethod::OAuth) => false,
            
            // Gemini 支持两种方式
            (ServiceProvider::Gemini, AuthMethod::ApiKey) => true,
            (ServiceProvider::Gemini, AuthMethod::OAuth) => true,
            
            // Qwen 目前只支持OAuth
            (ServiceProvider::Qwen, AuthMethod::ApiKey) => false,
            (ServiceProvider::Qwen, AuthMethod::OAuth) => true,
        }
    }
    
    /// 获取支持的配置列表
    pub fn all_supported() -> Vec<Self> {
        vec![
            Self::anthropic_api(),
            Self::anthropic_oauth(),
            Self::openai_api(),
            Self::gemini_api(),
            Self::gemini_oauth(),
            Self::qwen_oauth(),
        ]
    }
}

impl std::fmt::Display for ProviderConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display_name())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_config_creation() {
        let config = ProviderConfig::anthropic_api();
        assert_eq!(config.service, ServiceProvider::Anthropic);
        assert_eq!(config.auth_method, AuthMethod::ApiKey);
        assert!(config.is_supported());
    }

    #[test]
    fn test_identifier_parsing() {
        let config = ProviderConfig::anthropic_oauth();
        let identifier = config.identifier();
        assert_eq!(identifier, "anthropic_oauth");
        
        let parsed = ProviderConfig::from_identifier(&identifier).unwrap();
        assert_eq!(parsed, config);
    }

    #[test]
    fn test_unsupported_combinations() {
        let config = ProviderConfig::new(ServiceProvider::OpenAI, AuthMethod::OAuth);
        assert!(!config.is_supported());
    }

    #[test]
    fn test_all_supported_configs() {
        let supported = ProviderConfig::all_supported();
        assert!(supported.len() >= 5);
        assert!(supported.iter().all(|c| c.is_supported()));
    }
}