//! 智能代理服务
//! 
//! 集成智能路由、负载均衡和请求代理功能

use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, error, instrument};

use crate::business::domain::{UpstreamAccount, User};
use crate::business::services::{
    SmartRouter, RequestFeatures, RoutingDecision, LoadBalancingStrategy
};
use crate::shared::{AppError, AppResult};
use futures_util::{Stream, StreamExt};
use bytes::Bytes;

/// 代理请求
#[derive(Debug, Clone)]
pub struct ProxyRequest {
    pub user: User,
    pub method: String,
    pub path: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub features: RequestFeatures,
    pub request_id: String,
}

use std::pin::Pin;

/// 代理响应
pub struct ProxyResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Pin<Box<dyn Stream<Item = AppResult<Bytes>> + Send + Sync>>,
    pub latency_ms: u64,
    pub token_usage: super::TokenUsage,
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
        // 为SSE长连接优化的HTTP客户端配置
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))  // 5分钟超时，适合长时间的流式响应
            .connect_timeout(Duration::from_secs(10))  // 连接超时10秒
            .pool_idle_timeout(Duration::from_secs(90))  // 连接池空闲超时
            .tcp_keepalive(Duration::from_secs(60))  // TCP保活，防止长连接被中断
            // reqwest 默认启用gzip解压
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
            "🚀 [{}] 智能代理请求：用户 {} -> {} {}",
            request.request_id, request.user.id, request.method, request.path
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
                self.update_stats(true, latency, response.token_usage.total_tokens, response.cost_usd, &routing_decision).await;

                info!(
                    "✅ 代理请求成功：延迟 {}ms, tokens: {}, 成本: ${:.4}",
                    latency, response.token_usage.total_tokens, response.cost_usd
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
        let upstream_url = self.build_upstream_url(request, account)?;
        
        info!("🔍 [{}] [上游请求构建] 目标URL: {}", request.request_id, upstream_url);
        info!("🔍 [{}] [上游请求构建] 方法: {}", request.request_id, request.method);
        
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

        // 转发客户端请求头（过滤不应该转发的头部）
        info!("🔍 [{}] [上游请求] 开始转发客户端请求头", request.request_id);
        let mut forwarded_headers_count = 0;
        for (key, value) in &request.headers {
            let key_lower = key.to_lowercase();
            if key_lower != "authorization" && key_lower != "host" && key_lower != "connection" {
                req_builder = req_builder.header(key, value);
                forwarded_headers_count += 1;
                info!("🔍 [{}] [上游请求] 转发头部: '{}': '{}'", request.request_id, key, value);
            } else {
                info!("🔍 [{}] [上游请求] 过滤头部: '{}'", request.request_id, key);
            }
        }
        info!("🔍 [{}] [上游请求] 共转发 {} 个请求头部", request.request_id, forwarded_headers_count);

        // 添加请求体
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());
        }
        
        // 执行上游请求
        info!("🔍 [{}] [上游请求] 开始发送请求到上游服务器", request.request_id);
        
        // 添加请求的详细信息日志
        info!("🔍 [{}] [上游请求] 最终请求详情:", request.request_id);
        info!("🔍 [{}] [上游请求] - 目标URL: {}", request.request_id, upstream_url);
        info!("🔍 [{}] [上游请求] - 方法: {}", request.request_id, request.method);
        
        let response = req_builder
            .send()
            .await
            .map_err(|e| {
                error!("❌ [{}] [上游请求] 发送失败: {}", request.request_id, e);
                error!("❌ [{}] [上游请求] 错误详情: {:?}", request.request_id, e);
                AppError::ExternalService(format!("上游请求失败: {}", e))
            })?;

        info!("🔍 [{}] [上游响应] 收到上游响应", request.request_id);

        // 提取响应信息
        let status = response.status().as_u16();
        let response_headers = response.headers();
        
        info!("🔍 [{}] [上游响应] HTTP状态码: {}", request.request_id, status);
        
        let headers: std::collections::HashMap<String, String> = response_headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        // 检查是否是流式响应
        let content_type = headers.get("content-type").cloned();
        let is_sse = content_type.as_ref().map_or(false, |ct| ct.contains("text/event-stream"));
        
        info!("🔍 [{}] [上游响应] Content-Type: {:?}", request.request_id, content_type);
        info!("🔍 [{}] [上游响应] 检测到SSE: {}", request.request_id, is_sse);

        // 如果是401错误，记录响应体内容用于调试
        if status == 401 {
            error!("❌ [{}] [上游响应] 收到401认证错误，开始读取错误响应体", request.request_id);
            
            // 对于401错误，先读取响应体来获取详细错误信息
            let error_body = response.text().await
                .map_err(|e| {
                    error!("❌ [{}] [上游响应] 读取401错误响应体失败: {}", request.request_id, e);
                    AppError::ExternalService(format!("读取401错误响应体失败: {}", e))
                })?;
            
            error!("❌ [{}] [上游响应] 401错误详情: {}", request.request_id, error_body);
            
            // 返回包含详细信息的错误
            return Err(AppError::ExternalService(format!("401认证错误: {}", error_body)));
        }

        // 对于SSE响应，保持流式特性
        let request_id_clone = request.request_id.clone();
        let body_stream = response.bytes_stream()
            .map(move |result| {
                result.map_err(|e| {
                    error!("❌ [{}] [上游响应] 读取流式响应体失败: {}", request_id_clone, e);
                    AppError::ExternalService(format!("读取流式响应体失败: {}", e))
                })
            });

        info!("🔍 [{}] [上游响应] ✅ 流式响应体准备就绪", request.request_id);

        // TODO: 临时使用简单估算，稍后实现完整的Token解析
        let estimated_tokens = 100;
        let cost_usd = (estimated_tokens as f64 / 1000.0) * 0.003;

        Ok(ProxyResponse {
            status,
            headers,
            body: Box::pin(body_stream),
            latency_ms: 0, // 将由调用者设置
            token_usage: super::TokenUsage {
                input_tokens: estimated_tokens / 2,
                output_tokens: estimated_tokens / 2,
                cache_creation_tokens: 0,
                cache_read_tokens: 0,
                total_tokens: estimated_tokens,
                tokens_per_second: None,
            },
            cost_usd,
            upstream_account_id: account.id,
            routing_decision: RoutingDecision { // 将由调用者设置
                selected_account: account.clone(),
                strategy_used: LoadBalancingStrategy::Adaptive, // 占位符
                confidence_score: 0.0,
                reasoning: String::new(),
            },
        })
    }

    /// 构建上游URL  
    fn build_upstream_url(&self, request: &ProxyRequest, account: &UpstreamAccount) -> AppResult<String> {
        // 优先使用账号配置中的base_url，否则使用默认值
        let base_url = if let Some(custom_base_url) = &account.credentials.base_url {
            custom_base_url.as_str()
        } else {
            // 默认base_url
            match account.provider {
                crate::business::domain::AccountProvider::AnthropicApi | 
                crate::business::domain::AccountProvider::AnthropicOauth => {
                    "https://api.anthropic.com"
                }
                _ => "https://api.unknown.com" // TODO: 实现其他提供商
            }
        };

        // 路径转换逻辑
        let converted_path = match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi |
            crate::business::domain::AccountProvider::AnthropicOauth => {
                // Claude API路径转换
                if request.path.starts_with("/v1/messages") {
                    "/v1/messages"
                } else {
                    &request.path
                }
            }
            _ => &request.path // TODO: 实现其他提供商的路径转换
        };

        // 保留查询参数（如?beta=true）
        let full_path = if request.path.contains('?') {
            let parts: Vec<&str> = request.path.split('?').collect();
            if parts.len() == 2 {
                format!("{}?{}", converted_path, parts[1])
            } else {
                converted_path.to_string()
            }
        } else {
            converted_path.to_string()
        };

        Ok(format!("{}{}", base_url, full_path))
    }

    /// 添加认证头
    fn add_auth_headers(
        &self,
        mut req_builder: reqwest::RequestBuilder,
        account: &UpstreamAccount,
    ) -> AppResult<reqwest::RequestBuilder> {
        info!("🔍 [认证] 开始添加认证头部, 账号ID: {}, 提供商: {:?}", account.id, account.provider);
        
        match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi => {
                // AnthropicApi类型：使用session_key或access_token
                let api_key = account.credentials.session_key.as_ref()
                    .or(account.credentials.access_token.as_ref());
                
                if let Some(key) = api_key {
                    info!("🔍 [认证] AnthropicApi认证密钥长度: {}, 前缀: {}", 
                          key.len(), 
                          if key.len() > 10 { &key[..10] } else { key });
                    
                    // 对于Anthropic API，根据key的格式选择认证方式
                    if key.starts_with("sk-ant-") {
                        info!("🔍 [认证] 使用 x-api-key 认证方式");
                        req_builder = req_builder.header("x-api-key", key);
                    } else {
                        info!("🔍 [认证] 使用 Authorization Bearer 认证方式");
                        req_builder = req_builder.header("Authorization", format!("Bearer {}", key));
                    }
                } else {
                    error!("❌ [认证] Anthropic API账号缺少认证信息");
                    return Err(AppError::Business("Anthropic API账号缺少认证信息".to_string()));
                }
            }
            crate::business::domain::AccountProvider::AnthropicOauth => {
                // AnthropicOauth类型：专门使用OAuth access_token
                if let Some(access_token) = &account.credentials.access_token {
                    info!("🔍 [认证] AnthropicOauth OAuth token长度: {}, 前缀: {}", 
                          access_token.len(), 
                          if access_token.len() > 10 { &access_token[..10] } else { access_token });
                    
                    // 检查token是否过期
                    if let Some(expires_at) = account.credentials.expires_at {
                        let now = chrono::Utc::now();
                        if expires_at <= now {
                            error!("❌ [认证] OAuth token已过期: expires_at={}, now={}", expires_at, now);
                            return Err(AppError::Business("OAuth access_token已过期".to_string()));
                        } else {
                            info!("🔍 [认证] OAuth token有效期: 还有{}分钟", 
                                  (expires_at - now).num_minutes());
                        }
                    } else {
                        info!("🔍 [认证] OAuth token没有设置过期时间");
                    }
                    
                    // 关键修复：根据token格式选择认证方式
                    if access_token.starts_with("sk-ant-") {
                        info!("🔍 [认证] OAuth token是sk-ant-*格式，使用 x-api-key 认证");
                        req_builder = req_builder.header("x-api-key", access_token);
                    } else {
                        info!("🔍 [认证] OAuth token非sk-ant-*格式，使用 Authorization Bearer 认证");
                        req_builder = req_builder.header("Authorization", format!("Bearer {}", access_token));
                    }
                } else {
                    error!("❌ [认证] Anthropic OAuth账号缺少access_token");
                    return Err(AppError::Business("Anthropic OAuth账号缺少access_token".to_string()));
                }
            }
            _ => {
                error!("❌ [认证] 不支持的提供商类型: {:?}", account.provider);
                return Err(AppError::Business("不支持的提供商类型".to_string()));
            }
        }

        info!("✅ [认证] 认证头部添加完成");
        Ok(req_builder)
    }

    /// 更新统计信息
    async fn update_stats(
        &self,
        success: bool,
        latency_ms: u64,
        total_tokens: u32,
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

        stats.total_tokens += total_tokens as u64;
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
            selected_account: create_test_account(1, AccountProvider::AnthropicApi),
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
                base_url: None,
            },
            is_active: true,
            created_at: Utc::now(),
        }
    }
}