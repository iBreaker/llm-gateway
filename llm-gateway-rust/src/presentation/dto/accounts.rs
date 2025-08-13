//! 上游账号API数据传输对象
//! 
//! 新架构：ServiceProvider + AuthMethod 分离

use serde::{Deserialize, Serialize};
use crate::business::domain::{ServiceProvider, AuthMethod, ProviderConfig};

/// 上游账号信息（API响应）
#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub id: i64,
    pub name: String,
    pub service_provider: String,   // anthropic, openai, gemini, qwen
    pub auth_method: String,        // api_key, oauth
    pub status: String,
    pub is_active: bool,
    pub created_at: String,
    pub request_count: i64,
    pub success_rate: f64,
    // OAuth 特定字段（仅当 auth_method = "oauth" 时显示）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_scopes: Option<String>,
    // 凭据信息（敏感字段会被过滤）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub credentials: Option<serde_json::Value>,
    // 代理配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_config: Option<serde_json::Value>,
}

/// 账号列表响应
#[derive(Debug, Serialize)]
pub struct AccountsListResponse {
    pub accounts: Vec<AccountInfo>,
    pub total: i64,
}

/// 创建账号请求
#[derive(Debug, Deserialize)]
pub struct CreateAccountRequest {
    pub name: String,
    pub service_provider: String,   // anthropic, openai, gemini, qwen
    pub auth_method: String,        // api_key, oauth
    #[serde(flatten)]
    pub credentials: AccountCredentials,
    // 代理配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_config: Option<AccountProxyConfigRequest>,
}

/// 更新账号请求
#[derive(Debug, Deserialize)]
pub struct UpdateAccountRequest {
    pub name: String,
    pub is_active: bool,
    #[serde(flatten)]
    pub credentials: Option<AccountCredentials>,
    // 代理配置
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_config: Option<AccountProxyConfigRequest>,
}

/// 账号凭据（根据认证方式的不同字段）
#[derive(Debug, Deserialize, Serialize)]
pub struct AccountCredentials {
    // API Key 认证字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    
    // OAuth 认证字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_refresh_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_scopes: Option<String>,
    
    // 通用字段
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_config: Option<serde_json::Value>,
}

impl AccountCredentials {
    /// 转换为 Domain 类型
    pub fn to_domain(&self) -> crate::business::domain::AccountCredentials {
        crate::business::domain::AccountCredentials {
            session_key: None, // DTO 中没有 session_key
            access_token: self.api_key.clone().or(self.oauth_access_token.clone()),
            refresh_token: self.oauth_refresh_token.clone(),
            expires_at: self.oauth_expires_at.map(|ts| chrono::DateTime::from_timestamp_millis(ts).unwrap_or_default()),
            base_url: self.base_url.clone(),
        }
    }
}

impl CreateAccountRequest {
    /// 验证请求数据并转换为 ProviderConfig
    pub fn validate_and_convert(&self) -> Result<ProviderConfig, String> {
        // 解析服务提供商
        let service_provider = match self.service_provider.to_lowercase().as_str() {
            "anthropic" => ServiceProvider::Anthropic,
            "openai" => ServiceProvider::OpenAI,
            "gemini" => ServiceProvider::Gemini,
            "qwen" => ServiceProvider::Qwen,
            _ => return Err(format!("不支持的服务提供商: {}", self.service_provider)),
        };

        // 解析认证方式
        let auth_method = match self.auth_method.to_lowercase().as_str() {
            "api_key" => AuthMethod::ApiKey,
            "oauth" => AuthMethod::OAuth,
            _ => return Err(format!("不支持的认证方式: {}", self.auth_method)),
        };

        // 验证认证方式与凭据的匹配性
        match auth_method {
            AuthMethod::ApiKey => {
                if self.credentials.api_key.is_none() {
                    return Err("API Key 认证方式需要提供 api_key 字段".to_string());
                }
            }
            AuthMethod::OAuth => {
                if self.credentials.oauth_access_token.is_none() {
                    return Err("OAuth 认证方式需要提供 oauth_access_token 字段".to_string());
                }
            }
        }

        Ok(ProviderConfig::new(service_provider, auth_method))
    }

    /// 提取基础URL（如果提供）
    pub fn base_url(&self) -> Option<String> {
        self.credentials.base_url.clone()
    }
}

impl AccountCredentials {
    /// 验证凭据字段（根据认证方式）
    pub fn validate_credentials(&self, auth_method: &AuthMethod) -> Result<(), String> {
        match auth_method {
            AuthMethod::ApiKey => {
                if self.api_key.is_none() {
                    return Err("API Key 认证方式需要提供 api_key 字段".to_string());
                }
            }
            AuthMethod::OAuth => {
                if self.oauth_access_token.is_none() {
                    return Err("OAuth 认证方式需要提供 oauth_access_token 字段".to_string());
                }
            }
        }
        Ok(())
    }
}

impl UpdateAccountRequest {
    /// 验证凭据字段（如果提供）
    pub fn validate_credentials(&self, auth_method: &AuthMethod) -> Result<(), String> {
        if let Some(ref credentials) = self.credentials {
            match auth_method {
                AuthMethod::ApiKey => {
                    if credentials.api_key.is_none() {
                        return Err("更新 API Key 认证账号需要提供 api_key 字段".to_string());
                    }
                }
                AuthMethod::OAuth => {
                    if credentials.oauth_access_token.is_none() {
                        return Err("更新 OAuth 认证账号需要提供 oauth_access_token 字段".to_string());
                    }
                }
            }
        }
        Ok(())
    }
}

/// 账号健康检查响应
#[derive(Debug, Serialize)]
pub struct HealthCheckResponse {
    pub id: i64,
    pub status: String,           // healthy, unhealthy, unknown
    pub response_time_ms: Option<i32>,
    pub last_check: String,
    pub success_rate: f64,
    pub message: String,
}

/// 支持的提供商列表响应
#[derive(Debug, Serialize)]
pub struct SupportedProvidersResponse {
    pub providers: Vec<ProviderInfo>,
}

/// 提供商信息
#[derive(Debug, Serialize)]
pub struct ProviderInfo {
    pub service_provider: String,
    pub display_name: String,
    pub supported_auth_methods: Vec<String>,
    pub required_fields: serde_json::Value,
}

impl SupportedProvidersResponse {
    /// 创建支持的提供商列表
    pub fn new() -> Self {
        let providers = vec![
            ProviderInfo {
                service_provider: "anthropic".to_string(),
                display_name: "Anthropic Claude".to_string(),
                supported_auth_methods: vec!["api_key".to_string(), "oauth".to_string()],
                required_fields: serde_json::json!({
                    "api_key": ["api_key"],
                    "oauth": ["oauth_access_token", "oauth_refresh_token"]
                }),
            },
            ProviderInfo {
                service_provider: "openai".to_string(),
                display_name: "OpenAI".to_string(),
                supported_auth_methods: vec!["api_key".to_string()],
                required_fields: serde_json::json!({
                    "api_key": ["api_key"]
                }),
            },
            ProviderInfo {
                service_provider: "gemini".to_string(),
                display_name: "Google Gemini".to_string(),
                supported_auth_methods: vec!["api_key".to_string(), "oauth".to_string()],
                required_fields: serde_json::json!({
                    "api_key": ["api_key"],
                    "oauth": ["oauth_access_token", "oauth_refresh_token"]
                }),
            },
            ProviderInfo {
                service_provider: "qwen".to_string(),
                display_name: "阿里云通义千问".to_string(),
                supported_auth_methods: vec!["api_key".to_string(), "oauth".to_string()],
                required_fields: serde_json::json!({
                    "api_key": ["api_key"],
                    "oauth": ["oauth_access_token", "oauth_refresh_token"]
                }),
            },
        ];

        Self { providers }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_request_validation_api_key() {
        let request = CreateAccountRequest {
            name: "test".to_string(),
            service_provider: "anthropic".to_string(),
            auth_method: "api_key".to_string(),
            credentials: AccountCredentials {
                api_key: Some("sk-ant-test".to_string()),
                oauth_access_token: None,
                oauth_refresh_token: None,
                oauth_expires_at: None,
                oauth_scopes: None,
                base_url: None,
                extra_config: None,
            },
        };

        let config = request.validate_and_convert().unwrap();
        assert_eq!(config.service_provider(), &ServiceProvider::Anthropic);
        assert_eq!(config.auth_method(), &AuthMethod::ApiKey);
    }

    #[test]
    fn test_create_request_validation_oauth() {
        let request = CreateAccountRequest {
            name: "test".to_string(),
            service_provider: "gemini".to_string(),
            auth_method: "oauth".to_string(),
            credentials: AccountCredentials {
                api_key: None,
                oauth_access_token: Some("access_token".to_string()),
                oauth_refresh_token: Some("refresh_token".to_string()),
                oauth_expires_at: Some(1692000000000),
                oauth_scopes: Some("read write".to_string()),
                base_url: None,
                extra_config: None,
            },
        };

        let config = request.validate_and_convert().unwrap();
        assert_eq!(config.service_provider(), &ServiceProvider::Gemini);
        assert_eq!(config.auth_method(), &AuthMethod::OAuth);
    }

    #[test]
    fn test_create_request_validation_missing_api_key() {
        let request = CreateAccountRequest {
            name: "test".to_string(),
            service_provider: "openai".to_string(),
            auth_method: "api_key".to_string(),
            credentials: AccountCredentials {
                api_key: None, // 缺少 API Key
                oauth_access_token: None,
                oauth_refresh_token: None,
                oauth_expires_at: None,
                oauth_scopes: None,
                base_url: None,
                extra_config: None,
            },
        };

        let result = request.validate_and_convert();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("需要提供 api_key"));
    }

    #[test]
    fn test_supported_providers_response() {
        let response = SupportedProvidersResponse::new();
        assert_eq!(response.providers.len(), 4);
        
        let anthropic = &response.providers[0];
        assert_eq!(anthropic.service_provider, "anthropic");
        assert_eq!(anthropic.supported_auth_methods.len(), 2);
        assert!(anthropic.supported_auth_methods.contains(&"api_key".to_string()));
        assert!(anthropic.supported_auth_methods.contains(&"oauth".to_string()));
    }
}

/// 账号代理配置请求
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AccountProxyConfigRequest {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_id: Option<String>,
}