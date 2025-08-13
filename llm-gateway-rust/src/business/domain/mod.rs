//! 领域模型模块
//! 
//! 定义业务领域的核心实体和值对象

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::shared::types::{UserId, ApiKeyId, UpstreamAccountId};

pub mod provider;
pub mod legacy_compat;
pub mod proxy_config;

pub use provider::{ServiceProvider, AuthMethod, ProviderConfig};
pub use legacy_compat::AccountProvider;
pub use proxy_config::{ProxyType, ProxyConfig, ProxyAuth, SystemProxyConfig, AccountProxyConfig};

/// 用户领域模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: UserId,
    pub username: String,
    pub email: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl User {
    /// 检查用户是否可以访问指定资源
    pub fn can_access_resource(&self, resource_id: i64) -> bool {
        self.is_active && self.id == resource_id
    }
    
    /// 检查用户是否为管理员
    pub fn is_admin(&self) -> bool {
        // 这里可以根据具体业务逻辑实现
        false
    }
}

/// API Key领域模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKey {
    pub id: ApiKeyId,
    pub user_id: UserId,
    pub name: String,
    pub key_hash: String,
    pub permissions: Vec<String>,
    pub is_active: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

impl ApiKey {
    /// 检查API Key是否有效
    pub fn is_valid(&self) -> bool {
        if !self.is_active {
            return false;
        }
        
        if let Some(expires_at) = self.expires_at {
            if expires_at < Utc::now() {
                return false;
            }
        }
        
        true
    }
    
    /// 检查是否有指定权限
    pub fn has_permission(&self, permission: &str) -> bool {
        self.permissions.contains(&permission.to_string()) || 
        self.permissions.contains(&"*".to_string())
    }
    
    /// 更新最后使用时间
    pub fn mark_as_used(&mut self) {
        self.last_used_at = Some(Utc::now());
    }
}

/// 上游账号领域模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpstreamAccount {
    pub id: UpstreamAccountId,
    pub user_id: UserId,
    pub provider_config: ProviderConfig,
    pub account_name: String,
    pub credentials: AccountCredentials,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    // OAuth 相关字段
    pub oauth_expires_at: Option<i64>,
    pub oauth_scopes: Option<String>,
    // 代理配置
    pub proxy_config: Option<AccountProxyConfig>,
}

impl UpstreamAccount {
    /// 获取实时健康状态
    /// 注意：这里应该通过实时接口调用来判断，而不是依赖存储的health_status字段
    pub async fn check_real_time_health(&self) -> HealthStatus {
        // 如果账号未激活，直接返回不健康
        if !self.is_active {
            return HealthStatus::Unhealthy;
        }

        // 检查凭据有效性
        if !self.credentials.is_valid() {
            return HealthStatus::Unhealthy;
        }

        // 执行简单的实时健康检查
        match self.perform_health_check().await {
            Ok(_) => HealthStatus::Healthy,
            Err(_) => HealthStatus::Unhealthy,
        }
    }

    /// 执行实际的健康检查
    async fn perform_health_check(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 这里应该根据提供商配置实现具体的健康检查逻辑
        match (&self.provider_config.service, &self.provider_config.auth_method) {
            (ServiceProvider::Anthropic, AuthMethod::ApiKey) => {
                // Anthropic API Key 健康检查
                self.check_anthropic_api_health().await
            },
            (ServiceProvider::Anthropic, AuthMethod::OAuth) => {
                // Anthropic OAuth 健康检查
                self.check_anthropic_oauth_health().await
            },
            (ServiceProvider::OpenAI, AuthMethod::ApiKey) => {
                // OpenAI API Key 健康检查
                self.check_openai_api_health().await
            },
            (ServiceProvider::Gemini, AuthMethod::ApiKey) => {
                // Gemini API Key 健康检查
                self.check_gemini_api_health().await
            },
            (ServiceProvider::Gemini, AuthMethod::OAuth) => {
                // Gemini OAuth 健康检查
                self.check_gemini_oauth_health().await
            },
            (ServiceProvider::Qwen, AuthMethod::OAuth) => {
                // Qwen OAuth 健康检查
                self.check_qwen_oauth_health().await
            },
            _ => {
                // 不支持的配置组合
                Err("不支持的提供商配置组合".into())
            }
        }
    }

    /// 检查 Anthropic API 健康状态
    async fn check_anthropic_api_health(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 简化的健康检查：检查凭据是否存在
        if self.credentials.access_token.is_some() || self.credentials.session_key.is_some() {
            Ok(())
        } else {
            Err("缺少必要的凭据".into())
        }
    }

    /// 检查 Anthropic OAuth 健康状态
    async fn check_anthropic_oauth_health(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 检查 OAuth token 是否有效
        if self.credentials.is_valid() && self.credentials.access_token.is_some() {
            // 可以进一步检查 token 是否即将过期，是否需要刷新
            if self.credentials.needs_refresh() && self.credentials.refresh_token.is_none() {
                Err("OAuth token 即将过期且无法刷新".into())
            } else {
                Ok(())
            }
        } else {
            Err("OAuth token 无效或过期".into())
        }
    }

    /// 检查 OpenAI API 健康状态
    async fn check_openai_api_health(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 检查 OpenAI API Key 凭据
        if self.credentials.access_token.is_some() || self.credentials.session_key.is_some() {
            Ok(())
        } else {
            Err("缺少 OpenAI API Key".into())
        }
    }

    /// 检查 Gemini API 健康状态
    async fn check_gemini_api_health(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 检查 Gemini API Key 凭据
        if self.credentials.access_token.is_some() || self.credentials.session_key.is_some() {
            Ok(())
        } else {
            Err("缺少 Gemini API Key".into())
        }
    }

    /// 检查 Gemini OAuth 健康状态
    async fn check_gemini_oauth_health(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 检查 Gemini OAuth token
        if self.credentials.is_valid() && self.credentials.access_token.is_some() {
            if self.credentials.needs_refresh() && self.credentials.refresh_token.is_none() {
                Err("Gemini OAuth token 即将过期且无法刷新".into())
            } else {
                Ok(())
            }
        } else {
            Err("Gemini OAuth token 无效或过期".into())
        }
    }

    /// 检查 Qwen OAuth 健康状态
    async fn check_qwen_oauth_health(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // 检查 Qwen OAuth token
        if self.credentials.is_valid() && self.credentials.access_token.is_some() {
            if self.credentials.needs_refresh() && self.credentials.refresh_token.is_none() {
                Err("Qwen OAuth token 即将过期且无法刷新".into())
            } else {
                Ok(())
            }
        } else {
            Err("Qwen OAuth token 无效或过期".into())
        }
    }

    /// 获取状态显示字符串（用于前端显示）
    pub async fn get_status_display(&self) -> String {
        let real_time_status = self.check_real_time_health().await;
        match real_time_status {
            HealthStatus::Healthy => "正常".to_string(),
            HealthStatus::Degraded => "降级".to_string(), 
            HealthStatus::Unhealthy => "异常".to_string(),
            HealthStatus::Unknown => "未知".to_string(),
        }
    }

    /// 获取代理配置
    pub fn get_proxy_config(&self) -> &Option<AccountProxyConfig> {
        &self.proxy_config
    }

    /// 设置代理配置
    pub fn set_proxy_config(&mut self, proxy_config: Option<AccountProxyConfig>) {
        self.proxy_config = proxy_config;
    }

    /// 启用代理
    pub fn enable_proxy(&mut self, proxy_id: Option<String>) {
        self.proxy_config = Some(if let Some(id) = proxy_id {
            AccountProxyConfig::enable_with_proxy(id)
        } else {
            AccountProxyConfig::enable_with_default()
        });
    }

    /// 禁用代理
    pub fn disable_proxy(&mut self) {
        self.proxy_config = Some(AccountProxyConfig::disable());
    }

    /// 检查是否启用了代理
    pub fn is_proxy_enabled(&self) -> bool {
        if let Some(proxy_config) = &self.proxy_config {
            proxy_config.enabled
        } else {
            false
        }
    }

    /// 获取实际使用的代理配置
    pub fn resolve_proxy_config<'a>(&self, system_config: &'a SystemProxyConfig) -> Option<&'a ProxyConfig> {
        if let Some(account_proxy_config) = &self.proxy_config {
            account_proxy_config.resolve_proxy(system_config)
        } else {
            None
        }
    }
}


/// 账号凭据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountCredentials {
    pub session_key: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub base_url: Option<String>,
}

impl AccountCredentials {
    /// 检查凭据是否有效
    pub fn is_valid(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at > Utc::now()
        } else {
            true
        }
    }
    
    /// 检查是否需要刷新
    pub fn needs_refresh(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            let refresh_threshold = Utc::now() + chrono::Duration::minutes(10);
            expires_at < refresh_threshold
        } else {
            false
        }
    }
}

/// 健康状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

impl HealthStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            HealthStatus::Healthy => "healthy",
            HealthStatus::Degraded => "degraded",
            HealthStatus::Unhealthy => "unhealthy",
            HealthStatus::Unknown => "unknown",
        }
    }
    
    pub fn from_str(s: &str) -> Self {
        match s {
            "healthy" => HealthStatus::Healthy,
            "degraded" => HealthStatus::Degraded,
            "unhealthy" => HealthStatus::Unhealthy,
            _ => HealthStatus::Unknown,
        }
    }
}

/// 使用记录领域模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecord {
    pub id: i64,
    pub api_key_id: ApiKeyId,
    pub upstream_account_id: UpstreamAccountId,
    pub request_method: String,
    pub request_path: String,
    pub response_status: i32,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cache_creation_tokens: i32,
    pub cache_read_tokens: i32,
    pub total_tokens: i32,
    pub cost_usd: f64,
    pub latency_ms: i32,
    pub created_at: DateTime<Utc>,
}

impl UsageRecord {
    /// 判断请求是否成功
    pub fn is_successful(&self) -> bool {
        self.response_status >= 200 && self.response_status < 300
    }
    
    /// 判断是否为高延迟请求
    pub fn is_high_latency(&self) -> bool {
        self.latency_ms > 5000 // 5秒
    }
}