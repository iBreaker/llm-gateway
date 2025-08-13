//! 业务服务模块
//! 
//! 实现核心业务逻辑和服务编排

// 服务模块声明（将逐步实现）
// pub mod auth_service;
// pub mod api_key_service;
// pub mod upstream_service;
// pub mod proxy_service;
// pub mod health_service;

pub mod token_parser;
// pub mod stats_service;

// 负载均衡和智能路由服务（已实现）
pub mod load_balancer;
pub mod smart_router;
pub mod intelligent_proxy;
pub mod settings_service;
pub mod rate_limit_service;

// 新的代理架构模块
pub mod proxy;
pub mod proxy_client_factory;
pub mod proxy_manager;
pub mod upstream_proxy_service;
use crate::shared::{error::AppResult, types::*};
use crate::business::domain::*;

// 重新导出智能负载均衡相关类型
pub use load_balancer::{IntelligentLoadBalancer, LoadBalancingStrategy, NodeMetrics, CircuitBreaker};
pub use smart_router::{SmartRouter, RequestFeatures, RequestPriority, RequestType, UserPreferences, RoutingDecision};
pub use intelligent_proxy::{IntelligentProxy, ProxyStats};
pub use settings_service::{SettingsService, SharedSettingsService};
pub use rate_limit_service::{RateLimitService, SharedRateLimitService, RateLimitResult};
pub use upstream_proxy_service::{UpstreamProxyService, AccountProxySummary};

/// 认证服务接口
pub trait AuthService: Send + Sync {
    /// 用户登录
    async fn login(&self, username: &str, password: &str) -> AppResult<LoginResult>;
    
    /// 刷新Token
    async fn refresh_token(&self, refresh_token: &str) -> AppResult<TokenPair>;
    
    /// 验证Token
    async fn verify_token(&self, token: &str) -> AppResult<User>;
    
    /// 用户登出
    async fn logout(&self, user_id: UserId) -> AppResult<()>;
}

/// API Key服务接口
pub trait ApiKeyService: Send + Sync {
    /// 创建API Key
    async fn create_api_key(&self, request: CreateApiKeyRequest) -> AppResult<ApiKey>;
    
    /// 获取用户的API Keys
    async fn list_user_api_keys(&self, user_id: UserId, pagination: PaginationParams) -> AppResult<PaginatedResponse<ApiKey>>;
    
    /// 验证API Key
    async fn verify_api_key(&self, key: &str) -> AppResult<ApiKey>;
    
    /// 删除API Key
    async fn delete_api_key(&self, key_id: ApiKeyId, user_id: UserId) -> AppResult<()>;
}

/// 上游账号服务接口
pub trait UpstreamService: Send + Sync {
    /// 创建上游账号
    async fn create_account(&self, request: CreateUpstreamAccountRequest) -> AppResult<UpstreamAccount>;
    
    /// 获取用户的上游账号列表
    async fn list_user_accounts(&self, user_id: UserId, pagination: PaginationParams) -> AppResult<PaginatedResponse<UpstreamAccount>>;
    
    /// 删除上游账号
    async fn delete_account(&self, account_id: UpstreamAccountId, user_id: UserId) -> AppResult<()>;
    
    /// 刷新账号凭据
    async fn refresh_credentials(&self, account_id: UpstreamAccountId) -> AppResult<UpstreamAccount>;
}

/// 代理服务接口  
pub trait ProxyService: Send + Sync {
    /// 代理请求到上游服务
    async fn proxy_request(&self, request: ProxyRequest) -> AppResult<ProxyResponse>;
}

/// 健康检查服务接口
pub trait HealthService: Send + Sync {
    /// 检查单个账号健康状态
    async fn check_account_health(&self, account_id: UpstreamAccountId) -> AppResult<HealthStatus>;
    
    /// 批量检查账号健康状态
    async fn batch_health_check(&self, account_ids: Vec<UpstreamAccountId>) -> AppResult<Vec<(UpstreamAccountId, HealthStatus)>>;
    
    /// 获取系统整体健康状态
    async fn get_system_health(&self) -> AppResult<SystemHealth>;
}

/// 统计服务接口
pub trait StatsService: Send + Sync {
    /// 获取基础统计信息
    async fn get_basic_stats(&self, user_id: UserId) -> AppResult<BasicStats>;
    
    /// 获取成本分析
    async fn get_cost_analysis(&self, user_id: UserId, params: CostAnalysisParams) -> AppResult<CostAnalysis>;
    
    /// 获取性能分析
    async fn get_performance_analysis(&self, user_id: UserId, params: PerformanceAnalysisParams) -> AppResult<PerformanceAnalysis>;
}

// DTO定义
#[derive(Debug, serde::Deserialize)]
pub struct LoginResult {
    pub user: User,
    pub tokens: TokenPair,
}

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct TokenPair {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}

#[derive(Debug, serde::Deserialize)]
pub struct CreateApiKeyRequest {
    pub user_id: UserId,
    pub name: String,
    pub permissions: Vec<String>,
    pub expires_in_days: Option<u32>,
}

#[derive(Debug, serde::Deserialize)]
pub struct CreateUpstreamAccountRequest {
    pub user_id: UserId,
    pub provider: ProviderConfig,
    pub account_name: String,
    pub credentials: AccountCredentials,
}

#[derive(Debug)]
pub struct ProxyRequest {
    pub api_key: ApiKey,
    pub method: String,
    pub path: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<Vec<u8>>,
}

#[derive(Debug)]
pub struct ProxyResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Vec<u8>,
    pub latency_ms: u32,
    pub first_token_latency_ms: Option<u32>,
    pub queue_time_ms: u32,
    pub retry_count: u32,
    pub token_usage: TokenUsage,
    pub cost_usd: f64,
    pub model_name: Option<String>,
    pub request_type: String,
    pub upstream_provider: String,
    pub routing_info: RoutingInfo,
    pub cache_info: CacheInfo,
    pub error_info: Option<ErrorInfo>,
}

#[derive(Debug, Clone)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cache_creation_tokens: u32,
    pub cache_read_tokens: u32,
    pub total_tokens: u32,
    pub tokens_per_second: Option<f64>,
}

impl Default for TokenUsage {
    fn default() -> Self {
        Self {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            total_tokens: 0,
            tokens_per_second: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RoutingInfo {
    pub strategy: String,
    pub confidence_score: f64,
    pub reasoning: String,
}

#[derive(Debug, Clone)]
pub struct CacheInfo {
    pub hit_rate: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct ErrorInfo {
    pub error_type: String,
    pub error_message: String,
}

#[derive(Debug, serde::Serialize)]
pub struct SystemHealth {
    pub status: HealthStatus,
    pub database_status: HealthStatus,
    pub active_accounts: u32,
    pub total_accounts: u32,
    pub average_response_time_ms: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct BasicStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub total_tokens: u64,
    pub total_cost_usd: f64,
    pub average_latency_ms: f64,
}

#[derive(Debug, serde::Deserialize)]
pub struct CostAnalysisParams {
    pub start_date: chrono::DateTime<chrono::Utc>,
    pub end_date: chrono::DateTime<chrono::Utc>,
    pub group_by: String, // "day", "week", "month"
}

#[derive(Debug, serde::Serialize)]
pub struct CostAnalysis {
    pub total_cost_usd: f64,
    pub cost_breakdown: Vec<CostBreakdownItem>,
    pub trends: Vec<CostTrendItem>,
}

#[derive(Debug, serde::Serialize)]
pub struct CostBreakdownItem {
    pub category: String,
    pub cost_usd: f64,
    pub percentage: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct CostTrendItem {
    pub date: String,
    pub cost_usd: f64,
    pub requests: u64,
}

#[derive(Debug, serde::Deserialize)]
pub struct PerformanceAnalysisParams {
    pub start_date: chrono::DateTime<chrono::Utc>,
    pub end_date: chrono::DateTime<chrono::Utc>,
    pub percentile: f64, // 95.0 for P95
}

#[derive(Debug, serde::Serialize)]
pub struct PerformanceAnalysis {
    pub average_latency_ms: f64,
    pub p95_latency_ms: f64,
    pub p99_latency_ms: f64,
    pub success_rate: f64,
    pub throughput_rps: f64,
}