//! 领域模型模块
//! 
//! 定义业务领域的核心实体和值对象

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use crate::shared::types::{UserId, ApiKeyId, UpstreamAccountId};

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
    pub provider: AccountProvider,
    pub account_name: String,
    pub credentials: AccountCredentials,
    pub is_active: bool,
    pub health_status: HealthStatus,
    pub created_at: DateTime<Utc>,
    pub last_health_check: Option<DateTime<Utc>>,
}

/// 账号提供商
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountProvider {
    AnthropicApi,     // 对应 ANTHROPIC_API
    AnthropicOauth,   // 对应 ANTHROPIC_OAUTH  
}

impl AccountProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccountProvider::AnthropicApi => "anthropic_api",
            AccountProvider::AnthropicOauth => "anthropic_oauth",
        }
    }

    /// 从字符串解析AccountProvider
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "anthropic_api" => Some(AccountProvider::AnthropicApi),
            "anthropic_oauth" => Some(AccountProvider::AnthropicOauth),
            "claude_code" => Some(AccountProvider::AnthropicApi), // 向后兼容
            _ => None,
        }
    }

    /// 获取显示名称
    pub fn display_name(&self) -> &'static str {
        match self {
            AccountProvider::AnthropicApi => "Anthropic API",
            AccountProvider::AnthropicOauth => "Anthropic OAuth",
        }
    }

    /// 获取提供商名称
    pub fn provider_name(&self) -> &'static str {
        match self {
            AccountProvider::AnthropicApi | AccountProvider::AnthropicOauth => "Anthropic",
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
    pub tokens_used: i32,
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