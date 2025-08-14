//! 代理协调器
//! 
//! 集成智能路由、负载均衡和请求代理功能的主协调器
//! 严格保持原有IntelligentProxy的所有逻辑

use std::time::Instant;
use std::sync::Arc;
use std::pin::Pin;
use std::collections::HashMap;
use tracing::{info, error, debug, instrument};
use futures_util::Stream;
use bytes::Bytes;

use crate::business::domain::{UpstreamAccount, User, SystemProxyConfig};
use crate::business::services::{
    SmartRouter, RequestFeatures, RoutingDecision, LoadBalancingStrategy,
    proxy_client_factory::ProxyClientFactory
};
use crate::shared::{AppError, AppResult};

use super::traits::{ProviderFactory, TokenUsage};
use super::providers::DefaultProviderFactory;
use super::metrics::ProxyMetrics;

/// 代理请求（保持原有结构）
#[derive(Debug, Clone)]
pub struct ProxyRequest {
    pub user: User,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Option<Vec<u8>>,
    pub features: RequestFeatures,
    pub request_id: String,
}

/// 代理响应（保持原有结构）
pub struct ProxyResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Pin<Box<dyn Stream<Item = AppResult<Bytes>> + Send>>,
    pub latency_ms: u64,
    pub token_usage: TokenUsage,
    pub cost_usd: f64,
    pub upstream_account_id: i64,
    pub routing_decision: RoutingDecision,
}

/// 代理协调器（重构后的IntelligentProxy）
pub struct ProxyCoordinator {
    smart_router: Arc<SmartRouter>,
    metrics: ProxyMetrics,
    provider_factory: Box<dyn ProviderFactory>,
    // 系统代理配置
    system_proxy_config: Arc<SystemProxyConfig>,
}

impl ProxyCoordinator {
    /// 创建新的代理协调器（支持系统代理配置）
    pub fn new() -> Self {
        Self::new_with_system_proxy_config(Arc::new(SystemProxyConfig::new()))
    }

    /// 创建带有系统代理配置的代理协调器
    pub fn new_with_system_proxy_config(system_proxy_config: Arc<SystemProxyConfig>) -> Self {
        Self {
            smart_router: Arc::new(SmartRouter::new()),
            metrics: ProxyMetrics::new(),
            provider_factory: Box::new(DefaultProviderFactory::default()),
            system_proxy_config,
        }
    }

    /// 更新系统代理配置
    pub fn update_system_proxy_config(&mut self, config: Arc<SystemProxyConfig>) {
        self.system_proxy_config = config;
        info!("🔄 系统代理配置已更新");
    }

    /// 获取系统代理配置
    pub fn get_system_proxy_config(&self) -> Arc<SystemProxyConfig> {
        Arc::clone(&self.system_proxy_config)
    }

    /// 代理请求到最佳上游服务（保持原有完整逻辑）
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

        // 第一步：智能路由决策（完全保持原有逻辑）
        let routing_decision = self.smart_router
            .route_request(&request.user, available_accounts, &request.features)
            .await?;

        info!(
            "📍 路由决策：选择账号 {} (策略: {:?}, 置信度: {:.2})",
            routing_decision.selected_account.account_name,
            routing_decision.strategy_used,
            routing_decision.confidence_score
        );

        // 第二步：执行上游请求（使用新的模块化方法）
        let upstream_result = self.execute_upstream_request(&request, &routing_decision.selected_account).await;

        // 第三步：处理响应和记录统计（完全保持原有逻辑）
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
                self.metrics.update_stats(
                    true, 
                    latency, 
                    &response.token_usage, 
                    response.cost_usd, 
                    &routing_decision
                ).await;

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
                let empty_token_usage = TokenUsage::default();
                self.metrics.update_stats(
                    false, 
                    latency, 
                    &empty_token_usage, 
                    0.0, 
                    &routing_decision
                ).await;

                error!(
                    "❌ 代理请求失败：延迟 {}ms, 错误: {}",
                    latency, e
                );

                Err(e)
            }
        }
    }

    /// 执行上游请求（使用模块化组件重构）
    async fn execute_upstream_request(
        &self,
        request: &ProxyRequest,
        account: &UpstreamAccount,
    ) -> AppResult<ProxyResponse> {
        // 获取提供商特定的组件
        let auth_strategy = self.provider_factory.create_auth_strategy(&account.provider_config)
            .ok_or_else(|| AppError::Business(format!("不支持的提供商配置: {:?}", account.provider_config)))?;
        
        let request_builder = self.provider_factory.create_request_builder(&account.provider_config)
            .ok_or_else(|| AppError::Business(format!("不支持的提供商配置: {:?}", account.provider_config)))?;
        
        let response_processor = self.provider_factory.create_response_processor(&account.provider_config)
            .ok_or_else(|| AppError::Business(format!("不支持的提供商配置: {:?}", account.provider_config)))?;

        // 构建上游URL（使用请求构建器）
        let query_params = if request.path.contains('?') {
            let parts: Vec<&str> = request.path.split('?').collect();
            if parts.len() == 2 { Some(parts[1]) } else { None }
        } else { None };
        
        let base_path = if request.path.contains('?') {
            request.path.split('?').next().unwrap_or(&request.path)
        } else {
            &request.path
        };
        
        let upstream_url = request_builder.build_upstream_url(account, base_path, query_params)?;
        
        info!("🔍 [{}] [上游请求构建] 目标URL: {}", request.request_id, upstream_url);
        info!("🔍 [{}] [上游请求构建] 方法: {}", request.request_id, request.method);

        // 根据账号代理配置创建HTTP客户端
        let proxy_config = account.resolve_proxy_config(&self.system_proxy_config);
        let http_client = ProxyClientFactory::create_client(proxy_config)?;

        if let Some(proxy) = proxy_config {
            info!("🔍 [{}] [代理配置] 使用代理: {} ({}://{}:{})",
                  request.request_id, proxy.name, proxy.proxy_type.as_str(), proxy.host, proxy.port);
        } else {
            info!("🔍 [{}] [代理配置] 使用直连模式", request.request_id);
        }
        
        // 构建HTTP请求
        let mut req_builder = match request.method.as_str() {
            "GET" => http_client.get(&upstream_url),
            "POST" => http_client.post(&upstream_url),
            "PUT" => http_client.put(&upstream_url),
            "DELETE" => http_client.delete(&upstream_url),
            "PATCH" => http_client.patch(&upstream_url),
            _ => return Err(AppError::Business(format!("不支持的HTTP方法: {}", request.method))),
        };

        // 添加认证头（使用认证策略，支持客户端头部）
        let auth_headers = auth_strategy.get_auth_headers_with_client(account, &request.headers).await?;
        let mut _auth_headers_count = 0;
        for (key, value) in auth_headers {
            req_builder = req_builder.header(&key, &value);
            _auth_headers_count += 1;
            // 只打印认证头的类型，不打印完整值
            if key.to_lowercase() == "authorization" {
                let preview = if value.len() > 20 {
                    format!("{}...{}", &value[..10], &value[value.len()-6..])
                } else {
                    value.clone()
                };
                info!("🔍 [{}] [上游请求] 添加认证头部: '{}': '{}'", request.request_id, key, preview);
            } else {
                info!("🔍 [{}] [上游请求] 添加认证头部: '{}': '{}'", request.request_id, key, value);
            }
        }

        // 转发客户端请求头（使用请求构建器过滤）
        info!("🔍 [{}] [上游请求] 开始转发客户端请求头", request.request_id);
        let filtered_headers = request_builder.filter_headers(&request.headers, account);
        let mut forwarded_headers_count = 0;
        
        for (key, value) in &filtered_headers {
            req_builder = req_builder.header(key, value);
            forwarded_headers_count += 1;
        }
        
        // 添加提供商特定头部
        let provider_headers = request_builder.add_provider_headers(account);
        let mut provider_headers_count = 0;
        for (key, value) in provider_headers {
            req_builder = req_builder.header(&key, &value);
            provider_headers_count += 1;
            debug!("🔍 [{}] [上游请求] 添加提供商头部: '{}': '{}'", request.request_id, key, value);
        }
        
        debug!("🔍 [{}] [上游请求] 共转发 {} 个客户端头部 + {} 个提供商头部", request.request_id, forwarded_headers_count, provider_headers_count);

        // 转换并添加请求体
        if let Some(body) = &request.body {
            debug!("🔍 [{}] [上游请求] 开始调用请求体转换", request.request_id);
            // 使用请求构建器转换请求体
            let transformed_body = match request_builder.transform_request_body(
                body, 
                account, 
                &request.request_id
            ) {
                Ok(transformed) => {
                    debug!("🔍 [{}] [上游请求] 请求体转换成功，大小: {} -> {} bytes", 
                          request.request_id, body.len(), transformed.len());
                    transformed
                },
                Err(e) => {
                    error!("🔍 [{}] [上游请求] 请求体转换失败: {}", request.request_id, e);
                    return Err(e);
                }
            };
            req_builder = req_builder.body(transformed_body);
        } else {
            info!("🔍 [{}] [上游请求] 无请求体", request.request_id);
        }
        
        // 执行上游请求（保持原有日志逻辑）
        info!("🔍 [{}] [上游请求] 开始发送请求到上游服务器", request.request_id);
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
        
        let headers: HashMap<String, String> = response_headers
            .iter()
            .filter_map(|(k, v)| {
                // 过滤掉content-encoding头部，因为reqwest已经自动解压了响应体
                // 但保留了原始头部，这会导致客户端（如Node.js fetch）尝试重复解压
                let key_lower = k.as_str().to_lowercase();
                if key_lower == "content-encoding" {
                    info!("🔍 [{}] [上游响应] 过滤content-encoding头部: {} = {}", 
                          request.request_id, k, v.to_str().unwrap_or(""));
                    None
                } else {
                    Some((k.to_string(), v.to_str().unwrap_or("").to_string()))
                }
            })
            .collect();

        // 检查是否是流式响应
        let content_type = headers.get("content-type").cloned();
        let is_sse = content_type.as_ref().map_or(false, |ct| ct.contains("text/event-stream"));
        
        info!("🔍 [{}] [上游响应] Content-Type: {:?}", request.request_id, content_type);
        info!("🔍 [{}] [上游响应] 检测到SSE: {}", request.request_id, is_sse);

        // 如果是401错误，记录响应体内容用于调试（保持原有逻辑）
        if status == 401 {
            error!("❌ [{}] [上游响应] 收到401认证错误，开始读取错误响应体", request.request_id);
            
            let error_body = response.text().await
                .map_err(|e| {
                    error!("❌ [{}] [上游响应] 读取401错误响应体失败: {}", request.request_id, e);
                    AppError::ExternalService(format!("读取401错误响应体失败: {}", e))
                })?;
            
            error!("❌ [{}] [上游响应] 401错误详情: {}", request.request_id, error_body);
            
            return Err(AppError::ExternalService(format!("401认证错误: {}", error_body)));
        }

        // 处理响应流（使用响应处理器）
        let body_stream = response_processor.process_response_stream(
            Box::pin(response.bytes_stream()),
            account,
            &request.request_id,
        ).await;

        info!("🔍 [{}] [上游响应] ✅ 流式响应体准备就绪", request.request_id);

        // 解析Token使用情况（使用响应处理器，这里先用临时估算）
        let estimated_tokens = 100;
        let token_usage = TokenUsage {
            input_tokens: estimated_tokens / 2,
            output_tokens: estimated_tokens / 2,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            total_tokens: estimated_tokens,
            tokens_per_second: None,
        };
        
        // 计算成本（使用响应处理器）
        let cost_usd = response_processor.calculate_cost(&token_usage, account);

        Ok(ProxyResponse {
            status,
            headers,
            body: body_stream,
            latency_ms: 0, // 将由调用者设置
            token_usage,
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

    /// 获取代理统计信息
    pub async fn get_stats(&self) -> super::metrics::ProxyStats {
        self.metrics.get_stats().await
    }

    /// 重置统计信息
    pub async fn reset_stats(&self) {
        self.metrics.reset_stats().await
    }

    /// 获取智能路由器引用
    pub fn get_smart_router(&self) -> Arc<SmartRouter> {
        Arc::clone(&self.smart_router)
    }
}

impl Default for ProxyCoordinator {
    fn default() -> Self {
        Self::new()
    }
}