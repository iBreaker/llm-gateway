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
    pub request_id: String,
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
        let upstream_url = self.build_upstream_url(request, account)?;
        
        info!("🔍 [{}] [上游请求构建] 目标URL: {}", request.request_id, upstream_url);
        info!("🔍 [{}] [上游请求构建] 方法: {}", request.request_id, request.method);
        info!("🔍 [{}] [上游请求构建] 客户端头部数量: {}", request.request_id, request.headers.len());
        
        // 详细记录客户端请求头部
        for (key, value) in &request.headers {
            info!("🔍 [{}] [上游请求构建] 客户端头部 '{}': '{}'", request.request_id, key, value);
        }
        
        if let Some(body) = &request.body {
            info!("🔍 [{}] [上游请求构建] 请求体大小: {} bytes", request.request_id, body.len());
            if body.len() <= 1000 {
                if let Ok(body_str) = std::str::from_utf8(body) {
                    info!("🔍 [{}] [上游请求构建] 请求体内容: {}", request.request_id, body_str);
                }
            }
        } else {
            info!("🔍 [{}] [上游请求构建] 无请求体", request.request_id);
        }

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
        info!("🔍 [上游请求构建] 开始添加认证头部");
        req_builder = self.add_auth_headers(req_builder, account)?;

        // 透明转发原始请求头（过滤不应该转发的头部）
        info!("🔍 [上游请求构建] 开始转发客户端头部");
        let mut forwarded_count = 0;
        let mut skipped_count = 0;
        
        for (key, value) in &request.headers {
            let key_lower = key.to_lowercase();
            // 过滤不应该转发的头部：authorization（需要替换）、host（会自动设置）、connection（连接相关）
            // ✅ 确保转发重要的流式相关头部如x-stainless-helper-method
            if key_lower != "authorization" && key_lower != "host" && key_lower != "connection" {
                req_builder = req_builder.header(key, value);
                forwarded_count += 1;
                if key_lower == "x-stainless-helper-method" {
                    info!("🔍 [上游请求构建] ✅ 转发流式头部: {} = {}", key, value);
                } else if key_lower.contains("stream") || key_lower.contains("sse") || key_lower.contains("event") {
                    info!("🔍 [上游请求构建] ✅ 转发流式相关头部: {} = {}", key, value);
                } else {
                    info!("🔍 [上游请求构建] ✓ 转发头部: {} = {}", key, value);
                }
            } else {
                skipped_count += 1;
                info!("🔍 [上游请求构建] ⏭ 跳过头部: {} = {}", key, value);
            }
        }
        
        info!("🔍 [上游请求构建] 头部转发统计 - 转发: {}, 跳过: {}", forwarded_count, skipped_count);

        // 添加请求体
        if let Some(body) = &request.body {
            info!("🔍 [上游请求构建] 添加请求体，大小: {} bytes", body.len());
            req_builder = req_builder.body(body.clone());
        } else {
            info!("🔍 [上游请求构建] 无请求体需要添加");
        }

        // 构建最终的请求，先不发送，用于调试
        let final_request = req_builder.build()
            .map_err(|e| AppError::ExternalService(format!("构建请求失败: {}", e)))?;

        // 打印详细的上游请求信息
        debug!("🔍 即将发送上游请求详情:");
        debug!("  URL: {}", final_request.url());
        debug!("  Method: {}", final_request.method());
        debug!("  Headers: {:#?}", final_request.headers());
        if let Some(body) = final_request.body() {
            if let Some(bytes) = body.as_bytes() {
                if let Ok(body_str) = std::str::from_utf8(bytes) {
                    debug!("  Body: {}", body_str);
                }
            }
        }
        
        // 重新构建请求（因为build()会消费req_builder）
        let mut final_req_builder = match request.method.as_str() {
            "GET" => self.http_client.get(&upstream_url),
            "POST" => self.http_client.post(&upstream_url),
            "PUT" => self.http_client.put(&upstream_url),
            "DELETE" => self.http_client.delete(&upstream_url),
            "PATCH" => self.http_client.patch(&upstream_url),
            _ => return Err(AppError::Business(format!("不支持的HTTP方法: {}", request.method))),
        };

        // 重新添加认证头
        final_req_builder = self.add_auth_headers(final_req_builder, account)?;

        // 重新转发头部
        for (key, value) in &request.headers {
            let key_lower = key.to_lowercase();
            if key_lower != "authorization" && key_lower != "host" && key_lower != "connection" {
                final_req_builder = final_req_builder.header(key, value);
                if key_lower == "x-stainless-helper-method" {
                    debug!("🔄 重新转发流式头部: {} = {}", key, value);
                }
            }
        }

        // 重新添加请求体
        if let Some(body) = &request.body {
            final_req_builder = final_req_builder.body(body.clone());
        }
        
        // 执行上游请求
        info!("🔍 [{}] [上游请求] 开始发送请求到上游服务器", request.request_id);
        let response = final_req_builder
            .send()
            .await
            .map_err(|e| {
                error!("❌ [{}] [上游请求] 发送失败: {}", request.request_id, e);
                AppError::ExternalService(format!("上游请求失败: {}", e))
            })?;

        info!("🔍 [{}] [上游响应] 收到上游响应", request.request_id);

        // 提取响应信息
        let status = response.status().as_u16();
        let response_headers = response.headers();
        
        info!("🔍 [上游响应] HTTP状态码: {}", status);
        info!("🔍 [上游响应] 响应头部数量: {}", response_headers.len());
        
        // 详细记录所有响应头部
        for (name, value) in response_headers.iter() {
            info!("🔍 [上游响应] 头部 '{}': '{}'", name, value.to_str().unwrap_or("<invalid_utf8>"));
        }
        
        let mut headers: std::collections::HashMap<String, String> = response_headers
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        // 检查是否是流式响应（在读取body之前）
        let content_type = headers.get("content-type").cloned();
        let is_sse = content_type.as_ref().map_or(false, |ct| ct.contains("text/event-stream"));
        
        info!("🔍 [上游响应] Content-Type: {:?}", content_type);
        info!("🔍 [上游响应] 检测到SSE: {}", is_sse);

        if is_sse {
            info!("🔍 [SSE上游响应] ✅ 检测到流式响应，开始读取流数据");
        }

        // 对于SSE响应，保持流式特性
        let body = if is_sse {
            info!("🔍 [SSE响应] 保持流式响应，不缓存整个响应体");
            // 对于SSE，我们需要特殊处理来保持流式特性
            // 暂时还是读取整个响应，但标记需要流式处理
            response.bytes().await
                .map_err(|e| {
                    error!("❌ [上游响应] 读取响应体失败: {}", e);
                    AppError::ExternalService(format!("读取响应体失败: {}", e))
                })?
                .to_vec()
        } else {
            // 非流式响应，正常读取
            response.bytes().await
                .map_err(|e| {
                    error!("❌ [上游响应] 读取响应体失败: {}", e);
                    AppError::ExternalService(format!("读取响应体失败: {}", e))
                })?
                .to_vec()
        };
            
        info!("🔍 [上游响应] ✅ 响应体读取完成，大小: {} bytes", body.len());
            
        // ✅ 修复：移除content-encoding相关头部，因为reqwest已经自动解压了
        let removed_headers = ["content-encoding", "Content-Encoding", "content-length", "Content-Length"];
        for header in &removed_headers {
            if headers.remove(&header.to_string()).is_some() {
                info!("🔍 [上游响应] 移除头部: {}", header);
            }
        }
        
        // 检查是否是流式响应
        if is_sse {
            info!("🔍 [SSE上游响应] 开始分析SSE响应体内容");
            
            if body.is_empty() {
                error!("❌ [SSE上游响应] 上游返回了空的SSE响应体！");
            } else if let Ok(body_str) = std::str::from_utf8(&body) {
                let lines: Vec<&str> = body_str.lines().collect();
                info!("🔍 [SSE上游响应] SSE响应行数: {}", lines.len());
                
                let mut event_count = 0;
                let mut data_count = 0;
                let mut error_count = 0;
                
                for (i, line) in lines.iter().enumerate() {
                    if line.starts_with("event:") {
                        event_count += 1;
                        if event_count <= 3 {
                            info!("🔍 [SSE上游响应] Event[{}]: {}", event_count, line);
                        }
                        
                        // 检查是否有error事件
                        if line.contains("error") {
                            error_count += 1;
                            error!("❌ [SSE上游响应] 发现错误事件: {}", line);
                        }
                    } else if line.starts_with("data:") {
                        data_count += 1;
                        if data_count <= 3 {
                            let preview = if line.len() > 200 {
                                format!("{}...", &line[..200])
                            } else {
                                line.to_string()
                            };
                            info!("🔍 [SSE上游响应] Data[{}]: {}", data_count, preview);
                        }
                    } else if !line.trim().is_empty() && i < 10 {
                        info!("🔍 [SSE上游响应] Other[{}]: {}", i, line);
                    }
                }
                
                info!("🔍 [SSE上游响应] 统计 - 事件: {}, 数据块: {}, 错误: {}", event_count, data_count, error_count);
                
                // 检查结束标记
                if let Some(last_lines) = lines.get(lines.len().saturating_sub(5)..) {
                    info!("🔍 [SSE上游响应] 最后几行:");
                    for (i, line) in last_lines.iter().enumerate() {
                        info!("🔍 [SSE上游响应] 末尾[{}]: '{}'", i, line);
                    }
                }
                
                // 检查是否正确结束
                let has_done_event = body_str.contains("event: done") || body_str.contains("event:done");
                let has_message_stop = body_str.contains("message_stop") || body_str.contains("content_block_stop");
                
                info!("🔍 [SSE上游响应] 完整性检查 - done事件: {}, stop消息: {}", has_done_event, has_message_stop);
                
                // 显示更多内容用于调试
                if body_str.len() <= 3000 {
                    info!("🔍 [SSE上游响应] 完整SSE内容:\n{}", body_str);
                } else {
                    info!("🔍 [SSE上游响应] SSE内容前1000字符:\n{}", &body_str[..1000]);
                    info!("🔍 [SSE上游响应] SSE内容后1000字符:\n{}", &body_str[body_str.len()-1000..]);
                }
            } else {
                error!("❌ [SSE上游响应] SSE响应包含非UTF-8数据，前500字节: {:?}", 
                       &body[..body.len().min(500)]);
            }
        } else {
            info!("🔍 [普通上游响应] 非SSE响应");
            if body.len() <= 2000 {
                if let Ok(body_str) = std::str::from_utf8(&body) {
                    info!("🔍 [普通上游响应] 响应内容: {}", body_str);
                }
            } else {
                info!("🔍 [普通上游响应] 响应体过大({} bytes)，不打印内容", body.len());
            }
        }

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
    fn build_upstream_url(&self, request: &ProxyRequest, account: &UpstreamAccount) -> AppResult<String> {
        // ✅ 修复：优先使用账号配置中的base_url，否则使用默认值
        let base_url = if let Some(custom_base_url) = &account.credentials.base_url {
            custom_base_url.as_str()
        } else {
            // 默认base_url
            match account.provider {
                crate::business::domain::AccountProvider::AnthropicApi | 
                crate::business::domain::AccountProvider::AnthropicOauth => {
                    "https://api.anthropic.com"
                }
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
        };

        // ✅ 修复：保留查询参数（如?beta=true）
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
        match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi |
            crate::business::domain::AccountProvider::AnthropicOauth => {
                // 优先使用session_key，如果不存在则使用access_token
                let api_key = account.credentials.session_key.as_ref()
                    .or(account.credentials.access_token.as_ref());
                
                if let Some(key) = api_key {
                    // 只添加认证头部，不重复添加anthropic-version（客户端已提供）
                    req_builder = req_builder.header("Authorization", format!("Bearer {}", key));
                } else {
                    return Err(AppError::Business("Anthropic账号缺少认证信息".to_string()));
                }
            }
        }

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