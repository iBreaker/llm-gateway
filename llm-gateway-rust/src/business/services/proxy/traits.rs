//! 代理服务核心抽象接口
//! 
//! 定义认证、请求构建、响应处理的通用接口

use async_trait::async_trait;
use std::collections::HashMap;
use bytes::Bytes;
use futures_util::Stream;
use std::pin::Pin;

use crate::business::domain::{UpstreamAccount, AccountProvider};
use crate::shared::{AppError, AppResult};

/// 认证策略接口
#[async_trait]
pub trait AuthStrategy: Send + Sync {
    /// 获取认证头部
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>>;
    
    /// 验证认证信息是否有效
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool>;
    
    /// 获取支持的提供商类型
    fn supported_provider(&self) -> AccountProvider;
}

/// 请求构建器接口
#[async_trait]
pub trait RequestBuilder: Send + Sync {
    /// 构建上游URL
    fn build_upstream_url(&self, account: &UpstreamAccount, path: &str, query: Option<&str>) -> AppResult<String>;
    
    /// 过滤和转换请求头
    fn filter_headers(&self, 
        headers: &HashMap<String, String>, 
        account: &UpstreamAccount
    ) -> HashMap<String, String>;
    
    /// 添加提供商特定的头部
    fn add_provider_headers(&self, account: &UpstreamAccount) -> HashMap<String, String>;
    
    /// 获取支持的提供商类型
    fn supported_provider(&self) -> AccountProvider;
}

/// 响应处理器接口
#[async_trait]
pub trait ResponseProcessor: Send + Sync {
    /// 处理响应流
    async fn process_response_stream(
        &self,
        response_stream: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
        account: &UpstreamAccount,
        request_id: &str,
    ) -> Pin<Box<dyn Stream<Item = AppResult<Bytes>> + Send + Sync>>;
    
    /// 解析Token使用情况
    async fn parse_token_usage(&self, 
        response_body: &[u8], 
        account: &UpstreamAccount
    ) -> AppResult<TokenUsage>;
    
    /// 计算请求成本
    fn calculate_cost(&self, token_usage: &TokenUsage, account: &UpstreamAccount) -> f64;
    
    /// 获取支持的提供商类型
    fn supported_provider(&self) -> AccountProvider;
}

/// Token使用统计
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

/// 提供商工厂接口
pub trait ProviderFactory: Send + Sync {
    /// 创建认证策略
    fn create_auth_strategy(&self, provider: &AccountProvider) -> Option<Box<dyn AuthStrategy>>;
    
    /// 创建请求构建器
    fn create_request_builder(&self, provider: &AccountProvider) -> Option<Box<dyn RequestBuilder>>;
    
    /// 创建响应处理器
    fn create_response_processor(&self, provider: &AccountProvider) -> Option<Box<dyn ResponseProcessor>>;
    
    /// 获取支持的提供商列表
    fn supported_providers(&self) -> Vec<AccountProvider>;
}