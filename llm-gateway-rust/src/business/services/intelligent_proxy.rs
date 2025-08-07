//! 智能代理服务
//! 
//! 集成智能路由、负载均衡和请求代理功能

use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, error, instrument, debug};

use crate::business::domain::{UpstreamAccount, User};
use crate::business::services::{
    SmartRouter, RequestFeatures, RoutingDecision, LoadBalancingStrategy
};
use crate::shared::{AppError, AppResult};

/// 代理请求
#[derive(Debug, Clone)]
pub struct ProxyRequest {
    pub user: User,
    pub method: String,
    pub path: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub features: RequestFeatures,
}

/// 代理响应
#[derive(Debug, Clone)]
pub struct ProxyResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Vec<u8>,
    pub latency_ms: u64,
    pub tokens_used: u32,
    pub cost_usd: f64,
    pub upstream_account_id: i64,
    pub routing_decision: RoutingDecision,
}

/// 代理统计信息
#[derive(Debug, Clone)]
pub struct ProxyStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_latency_ms: f64,
    pub total_tokens: u64,
    pub total_cost_usd: f64,
    pub requests_by_provider: std::collections::HashMap<String, u64>,
    pub requests_by_strategy: std::collections::HashMap<LoadBalancingStrategy, u64>,
}

/// 智能代理服务
pub struct IntelligentProxy {
    smart_router: Arc<SmartRouter>,
    stats: Arc<RwLock<ProxyStats>>,
    // HTTP客户端（用于实际的上游请求）
    http_client: reqwest::Client,
}

impl IntelligentProxy {
    /// 创建新的智能代理服务
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            smart_router: Arc::new(SmartRouter::new()),
            stats: Arc::new(RwLock::new(ProxyStats::default())),
            http_client,
        }
    }

    /// 代理请求到最佳上游服务
    #[instrument(skip(self, request, available_accounts))]
    pub async fn proxy_request(
        &self,
        request: ProxyRequest,
        available_accounts: &[UpstreamAccount],
    ) -> AppResult<ProxyResponse> {
        let start_time = Instant::now();

        info!(
            "🚀 智能代理请求：用户 {} -> {} {}",
            request.user.id, request.method, request.path
        );

        // 第一步：智能路由决策
        let routing_decision = self.smart_router
            .route_request(&request.user, available_accounts, &request.features)
            .await?;

        info!(
            "📍 路由决策：选择账号 {} (策略: {:?}, 置信度: {:.2})",
            routing_decision.selected_account.account_name,
            routing_decision.strategy_used,
            routing_decision.confidence_score
        );

        // 第二步：执行上游请求
        let upstream_result = self.execute_upstream_request(&request, &routing_decision.selected_account).await;

        // 第三步：处理响应和记录统计
        match upstream_result {
            Ok(mut response) => {
                let latency = start_time.elapsed().as_millis() as u64;
                response.latency_ms = latency;
                response.routing_decision = routing_decision.clone();

                // 记录成功
                self.smart_router.record_request_result(
                    &routing_decision.strategy_used,
                    routing_decision.selected_account.id,
                    true,
                    latency,
                ).await;

                // 更新统计信息
                self.update_stats(true, latency, response.tokens_used, response.cost_usd, &routing_decision).await;

                info!(
                    "✅ 代理请求成功：延迟 {}ms, tokens: {}, 成本: ${:.4}",
                    latency, response.tokens_used, response.cost_usd
                );

                Ok(response)
            }
            Err(e) => {
                let latency = start_time.elapsed().as_millis() as u64;

                // 记录失败
                self.smart_router.record_request_result(
                    &routing_decision.strategy_used,
                    routing_decision.selected_account.id,
                    false,
                    latency,
                ).await;

                // 更新统计信息
                self.update_stats(false, latency, 0, 0.0, &routing_decision).await;

                error!(
                    "❌ 代理请求失败：延迟 {}ms, 错误: {}",
                    latency, e
                );

                Err(e)
            }
        }
    }

    /// 执行上游请求
    async fn execute_upstream_request(
        &self,
        request: &ProxyRequest,
        account: &UpstreamAccount,
    ) -> AppResult<ProxyResponse> {
        // 构建上游URL
        let upstream_url = self.build_upstream_url(&request.path, account)?;
        
        debug!("🌐 上游请求URL: {}", upstream_url);

        // 构建HTTP请求
        let mut req_builder = match request.method.as_str() {
            "GET" => self.http_client.get(&upstream_url),
            "POST" => self.http_client.post(&upstream_url),
            "PUT" => self.http_client.put(&upstream_url),
            "DELETE" => self.http_client.delete(&upstream_url),
            "PATCH" => self.http_client.patch(&upstream_url),
            _ => return Err(AppError::Business(format!("不支持的HTTP方法: {}", request.method))),
        };

        // 添加认证头
        req_builder = self.add_auth_headers(req_builder, account)?;

        // 添加原始请求头（过滤掉一些不应该转发的头）
        for (key, value) in &request.headers {
            let key_lower = key.to_lowercase();
            if !["authorization", "host", "content-length", "connection"].contains(&key_lower.as_str()) {
                req_builder = req_builder.header(key, value);
            }
        }

        // 添加请求体
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());
        }

        // 发送请求
        let response = req_builder
            .send()
            .await
            .map_err(|e| AppError::ExternalService(format!("上游请求失败: {}", e)))?;

        // 提取响应信息
        let status = response.status().as_u16();
        let headers = response.headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response.bytes()
            .await
            .map_err(|e| AppError::ExternalService(format!("读取响应体失败: {}", e)))?
            .to_vec();

        // 估算使用的tokens和成本
        let (tokens_used, cost_usd) = self.estimate_usage(&body, account).await;

        Ok(ProxyResponse {
            status,
            headers,
            body,
            latency_ms: 0, // Will be set by caller
            tokens_used,
            cost_usd,
            upstream_account_id: account.id,
            routing_decision: RoutingDecision {
                selected_account: account.clone(),
                strategy_used: LoadBalancingStrategy::Adaptive, // Placeholder
                confidence_score: 0.0,
                reasoning: String::new(),
            }, // Will be set by caller
        })
    }

    /// 构建上游URL
    fn build_upstream_url(&self, path: &str, account: &UpstreamAccount) -> AppResult<String> {
        let base_url = match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi | 
            crate::business::domain::AccountProvider::AnthropicOauth => {
                "https://api.anthropic.com"
            }
        };

        // 路径转换逻辑
        let converted_path = match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi |
            crate::business::domain::AccountProvider::AnthropicOauth => {
                // Claude API路径转换
                if path.starts_with("/v1/messages") {
                    "/v1/messages"
                } else {
                    path
                }
            }
        };

        Ok(format!("{}{}", base_url, converted_path))
    }

    /// 添加认证头
    fn add_auth_headers(
        &self,
        mut req_builder: reqwest::RequestBuilder,
        account: &UpstreamAccount,
    ) -> AppResult<reqwest::RequestBuilder> {
        match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi |
            crate::business::domain::AccountProvider::AnthropicOauth => {
                if let Some(session_key) = &account.credentials.session_key {
                    req_builder = req_builder.header("x-api-key", session_key);
                    req_builder = req_builder.header("anthropic-version", "2023-06-01");
                } else {
                    return Err(AppError::Business("Anthropic账号缺少认证信息".to_string()));
                }
            }
        }

        req_builder = req_builder.header("User-Agent", "LLM-Gateway-Rust/1.0");
        req_builder = req_builder.header("Content-Type", "application/json");

        Ok(req_builder)
    }

    /// 估算token使用量和成本
    async fn estimate_usage(&self, response_body: &[u8], account: &UpstreamAccount) -> (u32, f64) {
        // 简化的token估算逻辑
        let content_length = response_body.len();
        let estimated_tokens = (content_length / 4).max(1) as u32; // 粗略估算：4字符=1token

        // 成本计算（基于提供商定价）
        let cost_per_1k_tokens = match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi |
            crate::business::domain::AccountProvider::AnthropicOauth => 0.003, // $0.003 per 1K tokens
        };

        let cost_usd = (estimated_tokens as f64 / 1000.0) * cost_per_1k_tokens;

        (estimated_tokens, cost_usd)
    }

    /// 更新统计信息
    async fn update_stats(
        &self,
        success: bool,
        latency_ms: u64,
        tokens_used: u32,
        cost_usd: f64,
        routing_decision: &RoutingDecision,
    ) {
        let mut stats = self.stats.write().await;

        stats.total_requests += 1;
        if success {
            stats.successful_requests += 1;
        } else {
            stats.failed_requests += 1;
        }

        // 更新平均延迟（移动平均）
        let alpha = 0.1;
        stats.average_latency_ms = alpha * latency_ms as f64 + (1.0 - alpha) * stats.average_latency_ms;

        stats.total_tokens += tokens_used as u64;
        stats.total_cost_usd += cost_usd;

        // 按提供商统计
        let provider_key = format!("{:?}", routing_decision.selected_account.provider);
        *stats.requests_by_provider.entry(provider_key).or_insert(0) += 1;

        // 按策略统计
        *stats.requests_by_strategy.entry(routing_decision.strategy_used.clone()).or_insert(0) += 1;
    }

    /// 获取代理统计信息
    pub async fn get_stats(&self) -> ProxyStats {
        let stats = self.stats.read().await;
        stats.clone()
    }

    /// 重置统计信息
    pub async fn reset_stats(&self) {
        let mut stats = self.stats.write().await;
        *stats = ProxyStats::default();
    }

    /// 获取智能路由器引用
    pub fn get_smart_router(&self) -> Arc<SmartRouter> {
        Arc::clone(&self.smart_router)
    }
}

impl Default for ProxyStats {
    fn default() -> Self {
        Self {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            average_latency_ms: 0.0,
            total_tokens: 0,
            total_cost_usd: 0.0,
            requests_by_provider: std::collections::HashMap::new(),
            requests_by_strategy: std::collections::HashMap::new(),
        }
    }
}

impl Default for IntelligentProxy {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::domain::{AccountCredentials, AccountProvider, HealthStatus};
    
    use chrono::Utc;

    #[tokio::test]
    async fn test_proxy_stats_update() {
        let proxy = IntelligentProxy::new();
        
        let routing_decision = RoutingDecision {
            selected_account: create_test_account(1, AccountProvider::ClaudeCode),
            strategy_used: LoadBalancingStrategy::Adaptive,
            confidence_score: 0.8,
            reasoning: "Test".to_string(),
        };

        proxy.update_stats(true, 500, 100, 0.01, &routing_decision).await;
        
        let stats = proxy.get_stats().await;
        assert_eq!(stats.total_requests, 1);
        assert_eq!(stats.successful_requests, 1);
        assert_eq!(stats.total_tokens, 100);
        assert_eq!(stats.total_cost_usd, 0.01);
    }

    fn create_test_account(id: i64, provider: AccountProvider) -> UpstreamAccount {
        UpstreamAccount {
            id,
            user_id: 1,
            provider,
            account_name: format!("test_account_{}", id),
            credentials: AccountCredentials {
                session_key: Some("test_key".to_string()),
                access_token: Some("test_token".to_string()),
                refresh_token: None,
                expires_at: None,
            },
            is_active: true,
            health_status: HealthStatus::Healthy,
            created_at: Utc::now(),
            last_health_check: Some(Utc::now()),
        }
    }
}