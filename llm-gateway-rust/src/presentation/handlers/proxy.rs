//! 智能代理处理器
//! 
//! 处理LLM API代理请求，集成智能路由和负载均衡

 
use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    Json, Extension,
};
use num_traits::cast::FromPrimitive;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, error, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};
use crate::auth::middleware::ApiKeyInfo;
use crate::business::services::{
    IntelligentProxy, RequestFeatures, RequestPriority, RequestType, ProxyResponse,
    intelligent_proxy::{ProxyRequest as ServiceProxyRequest}
};
use crate::business::domain::User;

/// 代理消息请求（Claude格式）
#[derive(Debug, Deserialize)]
pub struct ProxyMessageRequest {
    pub model: Option<String>,
    pub messages: Vec<Message>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub stream: Option<bool>,
    pub system: Option<String>,
    // 添加其他可能的字段以提高兼容性
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// 消息结构
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: serde_json::Value, // 支持字符串或对象数组
}

/// 代理响应
#[derive(Debug, Serialize)]
pub struct ProxyMessageResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub message_type: String,
    pub role: String,
    pub content: Vec<ContentBlock>,
    pub model: String,
    pub usage: Usage,
    pub routing_info: RoutingInfo,
}

/// 内容块
#[derive(Debug, Serialize)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: String,
}

/// 使用统计
#[derive(Debug, Serialize)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens: u32,
    pub cost_usd: f64,
}

/// 路由信息
#[derive(Debug, Serialize)]
pub struct RoutingInfo {
    pub strategy: String,
    pub upstream_account_id: i64,
    pub upstream_provider: String,
    pub confidence_score: f64,
    pub response_time_ms: u64,
    pub reasoning: String,
}

/// 模型列表响应
#[derive(Debug, Serialize)]
pub struct ModelListResponse {
    pub models: Vec<ModelInfo>,
}

/// 模型信息
#[derive(Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub max_tokens: u32,
    pub cost_per_1k_tokens: f64,
    pub capabilities: Vec<String>,
}

/// 代理消息请求（主要入口）
#[axum::debug_handler]
#[instrument(skip(app_state, headers, body))]
pub async fn proxy_messages(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(api_key_info): Extension<ApiKeyInfo>,
    headers: HeaderMap,
    body: String,
) -> AppResult<Response> {
    let database = &app_state.database;
    // 生成请求ID用于追踪
    let request_id = format!("req_{}", chrono::Utc::now().timestamp_micros());
    info!("🚀 [{}] 智能代理请求: API Key ID {}", request_id, api_key_info.id);

    // 先解析为通用JSON以支持任意字段
    let raw_json: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| AppError::Validation(format!("请求体解析失败: {}", e)))?;
    
    // 手动提取需要的字段
    let request = ProxyMessageRequest {
        model: raw_json.get("model").and_then(|v| v.as_str()).map(|s| s.to_string()),
        messages: raw_json.get("messages")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_else(Vec::new),
        max_tokens: raw_json.get("max_tokens").and_then(|v| v.as_u64()).map(|v| v as u32),
        temperature: raw_json.get("temperature").and_then(|v| v.as_f64()).map(|v| v as f32),
        stream: raw_json.get("stream").and_then(|v| v.as_bool()),
        system: raw_json.get("system").and_then(|v| v.as_str()).map(|s| s.to_string()),
        extra: raw_json.as_object().cloned().unwrap_or_default(),
    };

    // 获取用户信息
    let user = get_user_by_api_key(&database, &api_key_info).await?;

    // 分析请求特征
    let features = analyze_request_features(&request);

    // 获取可用的上游账号
    let available_accounts = get_available_upstream_accounts(&database, user.id).await?;
    info!("🔍 获取到 {} 个上游账号", available_accounts.len());
    
    for (i, account) in available_accounts.iter().enumerate() {
        info!("🔍 账号 {}: ID={}, 名称={}, 提供商={:?}, 活跃={}, 健康状态={:?}", 
              i + 1, account.id, account.account_name, account.provider, account.is_active, account.health_status);
    }

    if available_accounts.is_empty() {
        return Err(AppError::Business("没有可用的上游账号".to_string()));
    }

    // 🔍 调试：检查客户端请求信息
    info!("🔍 [{}] 客户端请求方法: POST", request_id);
    info!("🔍 [{}] 客户端请求路径: /v1/messages", request_id);  
    info!("🔍 [{}] 客户端请求头部: {:?}", request_id, headers);
    
    // 检查是否是流式请求
    let is_streaming_request = headers.get("x-stainless-helper-method")
        .map_or(false, |v| v.to_str().unwrap_or("").contains("stream"));
    info!("🔍 [{}] 客户端流式请求: {}", request_id, is_streaming_request);
    
    if body.len() < 1000 {
        info!("🔍 [{}] 客户端请求体: {}", request_id, body);
    } else {
        info!("🔍 [{}] 客户端请求体大小: {} bytes", request_id, body.len());
    }

    // 构建服务层代理请求
    let service_request = ServiceProxyRequest {
        user: user.clone(),
        method: "POST".to_string(),
        path: "/v1/messages".to_string(),
        headers: headers_to_hashmap(&headers),
        body: Some(body.into_bytes()),
        features,
        request_id: request_id.clone(),
    };

    // 创建智能代理服务
    let proxy_service = IntelligentProxy::new();

    // 执行智能代理
    match proxy_service.proxy_request(service_request, &available_accounts).await {
        Ok(service_response) => {
            // 记录使用统计（简化版本）
            // TODO: 需要转换ServiceProxyResponse到新的ProxyResponse格式
            // 记录使用统计（从流式响应中提取信息）
            record_usage_stats_from_streaming_response(&database, &api_key_info, &service_response).await?;
            
            info!("✅ 代理请求成功: 延迟 {}ms", service_response.latency_ms);
            
            // 🔍 调试：检查响应类型和内容
            let is_sse = service_response.headers.get("content-type")
                .map_or(false, |ct| ct.contains("text/event-stream"));
            
            info!("🔍 [{}] [下游响应构建] 检测到SSE: {}, HTTP状态: {}", request_id, is_sse, service_response.status);
            info!("🔍 [{}] [下游响应构建] 响应头部数量: {}", request_id, service_response.headers.len());
            
            // 详细记录所有响应头部
            for (key, value) in &service_response.headers {
                info!("🔍 [{}] [下游响应构建] 头部 '{}': '{}'", request_id, key, value);
            }
            
            // 移除对缓冲响应体的日志记录
            // info!("🔍 [{}] [下游响应构建] 响应体大小: {} bytes", request_id, service_response.body.len());
            
            // 直接返回上游响应，不做解析和转换
            let response = {
                let mut response_builder = Response::builder()
                    .status(StatusCode::from_u16(service_response.status).unwrap_or(StatusCode::OK));

                // 添加响应头
                for (key, value) in &service_response.headers {
                    if let (Ok(header_name), Ok(header_value)) = (
                        key.parse::<axum::http::HeaderName>(),
                        value.parse::<axum::http::HeaderValue>()
                    ) {
                        response_builder = response_builder.header(header_name, header_value);
                    }
                }

                if is_sse {
                    response_builder
                        .header("cache-control", "no-cache")
                        .header("connection", "keep-alive")
                        .body(Body::from_stream(service_response.body))
                        .map_err(|e| AppError::Internal(format!("构建流式响应失败: {}", e)))?
                } else {
                    // 对于非SSE，我们需要收集流
                    let body_bytes: Vec<u8> = service_response.body.collect::<Vec<_>>().await
                        .into_iter()
                        .filter_map(Result::ok)
                        .flatten()
                        .collect();
                    
                    response_builder
                        .body(Body::from(body_bytes))
                        .map_err(|e| AppError::Internal(format!("构建响应失败: {}", e)))?
                }
            };
                
            info!("🔍 [下游响应构建] ✅ 最终响应构建完成，准备返回给客户端");
            // 移除对缓冲响应体的日志记录
            // info!("🔍 [下游响应构建] 最终响应体大小: {} bytes", service_response.body.len());
            Ok(response)
        }
        Err(e) => {
            error!("❌ 代理请求失败: {}", e);
            
            // 记录失败统计
            record_failure_stats(&database, &api_key_info, Some("proxy_error"), Some(&e.to_string())).await?;
            
            Err(e)
        }
    }
}

/// 获取可用模型列表
#[instrument(skip(app_state))]
pub async fn list_models(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(api_key_info): Extension<ApiKeyInfo>,
) -> AppResult<Json<ModelListResponse>> {
    let database = &app_state.database;
    info!("📋 获取模型列表: API Key ID {}", api_key_info.id);

    // 获取用户的上游账号
    let user = get_user_by_api_key(&database, &api_key_info).await?;
    let accounts = get_available_upstream_accounts(&database, user.id).await?;

    let mut models = Vec::new();

    // 根据可用账号添加支持的模型
    for account in accounts {
        match account.provider {
            crate::business::domain::AccountProvider::AnthropicApi |
            crate::business::domain::AccountProvider::AnthropicOauth => {
                models.extend(vec![
                    ModelInfo {
                        id: "claude-3-sonnet-20240229".to_string(),
                        name: "Claude 3 Sonnet".to_string(),
                        provider: "anthropic".to_string(),
                        max_tokens: 200000,
                        cost_per_1k_tokens: 0.003,
                        capabilities: vec!["text".to_string(), "reasoning".to_string()],
                    },
                    ModelInfo {
                        id: "claude-3-haiku-20240307".to_string(),
                        name: "Claude 3 Haiku".to_string(),
                        provider: "anthropic".to_string(),
                        max_tokens: 200000,
                        cost_per_1k_tokens: 0.0015,
                        capabilities: vec!["text".to_string(), "fast".to_string()],
                    },
                ]);
            }
        }
    }

    // 去重
    models.sort_by(|a, b| a.id.cmp(&b.id));
    models.dedup_by(|a, b| a.id == b.id);

    let response = ModelListResponse { models };
    Ok(Json(response))
}

// 辅助函数

/// 根据API Key获取用户信息
async fn get_user_by_api_key(
    database: &Database,
    api_key_info: &ApiKeyInfo,
) -> AppResult<User> {
    let user_row = sqlx::query!(
        "SELECT id, username, email, is_active, created_at, updated_at FROM users WHERE id = $1",
        api_key_info.user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let user_row = user_row.ok_or_else(|| {
        AppError::Authentication(crate::infrastructure::AuthError::UserNotFound)
    })?;

    Ok(User {
        id: user_row.id,
        username: user_row.username,
        email: user_row.email,
        is_active: user_row.is_active,
        created_at: user_row.created_at,
        updated_at: user_row.updated_at,
    })
}

/// 获取用户可用的上游账号
async fn get_available_upstream_accounts(
    database: &Database,
    user_id: i64,
) -> AppResult<Vec<crate::business::domain::UpstreamAccount>> {
    info!("🔍 开始查询用户 {} 的可用上游账号", user_id);
    
    let accounts = sqlx::query!(
        r#"
        SELECT id, user_id, provider, name, credentials, is_active, 
               COALESCE(last_health_check, created_at) as last_health_check,
               created_at,
               CASE
                   WHEN error_count > 5 THEN 'unhealthy'
                   WHEN response_time_ms > 5000 THEN 'degraded'
                   WHEN last_health_check > NOW() - INTERVAL '10 minutes' THEN 'healthy'
                   ELSE 'unknown'
               END as health_status
        FROM upstream_accounts 
        WHERE user_id = $1
        ORDER BY last_health_check DESC
        "#,
        user_id
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("🔍 SQL查询返回 {} 条记录", accounts.len());

    let mut result = Vec::new();
    for (i, row) in accounts.into_iter().enumerate() {
        info!("🔍 处理第 {} 条记录: provider={}, name={}", i + 1, row.provider, row.name);
        let provider = match crate::business::domain::AccountProvider::from_str(&row.provider) {
            Some(p) => {
                info!("🔍 成功解析 provider: {:?}", p);
                p
            },
            None => {
                info!("🔍 无法解析 provider: {}, 跳过此记录", row.provider);
                continue;
            },
        };

        let health_status = match row.health_status.as_deref() {
            Some("healthy") => crate::business::domain::HealthStatus::Healthy,
            Some("degraded") => crate::business::domain::HealthStatus::Degraded,
            Some("unhealthy") => crate::business::domain::HealthStatus::Unhealthy,
            _ => crate::business::domain::HealthStatus::Unknown,
        };

        let credentials: serde_json::Value = row.credentials;
        let account_credentials = crate::business::domain::AccountCredentials {
            session_key: credentials.get("session_key").and_then(|v| v.as_str()).map(|s| s.to_string()),
            access_token: credentials.get("access_token").and_then(|v| v.as_str()).map(|s| s.to_string()),
            refresh_token: credentials.get("refresh_token").and_then(|v| v.as_str()).map(|s| s.to_string()),
            expires_at: credentials.get("expires_at").and_then(|v| v.as_str())
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.with_timezone(&chrono::Utc)),
            base_url: credentials.get("base_url").and_then(|v| v.as_str()).map(|s| s.to_string()),
        };

        result.push(crate::business::domain::UpstreamAccount {
            id: row.id,
            user_id: row.user_id,
            provider,
            account_name: row.name,
            credentials: account_credentials,
            is_active: row.is_active,
            health_status,
            created_at: row.created_at,
            last_health_check: row.last_health_check,
        });
    }

    Ok(result)
}

/// 分析请求特征
fn analyze_request_features(request: &ProxyMessageRequest) -> RequestFeatures {
    // 估算token数量
    let estimated_tokens = request.messages
        .iter()
        .map(|msg| {
            match &msg.content {
                serde_json::Value::String(s) => s.len() / 4,
                serde_json::Value::Array(arr) => {
                    arr.iter().map(|item| {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            text.len() / 4
                        } else {
                            50 // 默认估算
                        }
                    }).sum::<usize>()
                }
                _ => 50 // 默认估算
            }
        })
        .sum::<usize>() as u32;

    // 确定请求类型
    let request_type = if request.model.as_ref().map_or(false, |m| m.contains("code")) {
        RequestType::CodeGeneration
    } else if request.messages.len() > 5 {
        RequestType::Chat
    } else {
        RequestType::Analysis
    };

    // 确定优先级
    let priority = if request.max_tokens.unwrap_or(0) > 4000 {
        RequestPriority::High
    } else if estimated_tokens > 2000 {
        RequestPriority::Normal
    } else {
        RequestPriority::Low
    };

    RequestFeatures {
        model: request.model.clone().unwrap_or_else(|| "claude-3-sonnet".to_string()),
        estimated_tokens,
        priority,
        user_region: None,
        request_type,
        streaming: request.stream.unwrap_or(false),
    }
}

/// 转换Header为HashMap
fn headers_to_hashmap(headers: &HeaderMap) -> HashMap<String, String> {
    headers
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect()
}


/// 记录失败统计
async fn record_failure_stats(
    database: &Database,
    api_key_info: &ApiKeyInfo,
    error_type: Option<&str>,
    error_message: Option<&str>,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO usage_records (
            api_key_id, request_method, request_path, response_status,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens,
            cost_usd, latency_ms, first_token_latency_ms, queue_time_ms, retry_count,
            model_name, request_type, upstream_provider, routing_strategy, confidence_score,
            reasoning, cache_hit_rate, tokens_per_second, error_type, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW())
        "#,
        api_key_info.id,
        "POST",
        "/v1/messages",
        500i32,
        0i32, // input_tokens
        0i32, // output_tokens  
        0i32, // cache_creation_tokens
        0i32, // cache_read_tokens
        0i32, // total_tokens
        0.0,  // cost_usd
        0i32, // latency_ms
        None::<i32>, // first_token_latency_ms
        0i32, // queue_time_ms
        0i32, // retry_count
        None::<String>, // model_name
        "chat", // request_type
        "unknown", // upstream_provider
        "failed", // routing_strategy
        None::<sqlx::types::BigDecimal>, // confidence_score
        None::<String>, // reasoning
        None::<sqlx::types::BigDecimal>, // cache_hit_rate
        None::<sqlx::types::BigDecimal>, // tokens_per_second
        error_type, // error_type
        error_message // error_message
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(())
}


/// 记录使用统计（从流式响应）
async fn record_usage_stats_from_streaming_response(
    database: &Database,
    api_key_info: &ApiKeyInfo,
    response: &crate::business::services::intelligent_proxy::ProxyResponse,
) -> AppResult<()> {
    // 计算 tokens_per_second
    let tokens_per_second = if response.latency_ms > 0 {
        Some((response.token_usage.total_tokens as f64) / (response.latency_ms as f64 / 1000.0))
    } else {
        None
    };

    sqlx::query!(
        r#"
        INSERT INTO usage_records (
            api_key_id, upstream_account_id, request_method, request_path, response_status,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens,
            cost_usd, latency_ms, first_token_latency_ms, queue_time_ms, retry_count,
            model_name, request_type, upstream_provider, routing_strategy, confidence_score,
            reasoning, cache_hit_rate, tokens_per_second, error_type, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW())
        "#,
        api_key_info.id,
        Some(response.upstream_account_id),
        "POST",
        "/v1/messages",
        response.status as i32,
        response.token_usage.input_tokens as i32,
        response.token_usage.output_tokens as i32,
        response.token_usage.cache_creation_tokens as i32,
        response.token_usage.cache_read_tokens as i32,
        response.token_usage.total_tokens as i32,
        response.cost_usd,
        response.latency_ms as i32,
        None::<i32>, // first_token_latency_ms - 流式响应中暂不可用
        0i32, // queue_time_ms - 暂不可用
        0i32, // retry_count - 暂不可用
        None::<String>, // model_name - 需要从请求中解析
        "chat", // request_type
        response.routing_decision.selected_account.provider.as_str(),
        response.routing_decision.strategy_used.as_str(),
        Some(sqlx::types::BigDecimal::from_f64(response.routing_decision.confidence_score).unwrap_or_default()),
        Some(&response.routing_decision.reasoning),
        None::<sqlx::types::BigDecimal>, // cache_hit_rate - 暂不可用
        tokens_per_second.map(|tps| sqlx::types::BigDecimal::from_f64(tps).unwrap_or_default()),
        None::<String>, // error_type - 成功请求
        None::<String> // error_message - 成功请求
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 更新API Key最后使用时间
    sqlx::query!(
        "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
        api_key_info.id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(())
}

/// 记录使用统计（详细版本）
async fn record_usage_stats_detailed(
    database: &Database,
    api_key_info: &ApiKeyInfo,
    response: &ProxyResponse,
) -> AppResult<()> {
    // 计算 tokens_per_second
    let tokens_per_second = if response.latency_ms > 0 {
        Some((response.token_usage.total_tokens as f64) / (response.latency_ms as f64 / 1000.0))
    } else {
        None
    };

    sqlx::query!(
        r#"
        INSERT INTO usage_records (
            api_key_id, upstream_account_id, request_method, request_path, response_status,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens,
            cost_usd, latency_ms, first_token_latency_ms, queue_time_ms, retry_count,
            model_name, request_type, upstream_provider, routing_strategy, confidence_score,
            reasoning, cache_hit_rate, tokens_per_second, error_type, error_message, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW())
        "#,
        api_key_info.id,
        None::<i64>, // TODO: 从响应中获取upstream_account_id
        "POST",
        "/v1/messages",
        response.status as i32,
        response.token_usage.input_tokens as i32,
        response.token_usage.output_tokens as i32,
        response.token_usage.cache_creation_tokens as i32,
        response.token_usage.cache_read_tokens as i32,
        response.token_usage.total_tokens as i32,
        response.cost_usd,
        response.latency_ms as i32,
        response.first_token_latency_ms.map(|x| x as i32),
        response.queue_time_ms as i32,
        response.retry_count as i32,
        response.model_name.as_deref(),
        &response.request_type,
        &response.upstream_provider,
        &response.routing_info.strategy,
        Some(sqlx::types::BigDecimal::from_f64(response.routing_info.confidence_score).unwrap_or_default()),
        Some(&response.routing_info.reasoning),
        response.cache_info.hit_rate.map(|r| sqlx::types::BigDecimal::from_f64(r).unwrap_or_default()),
        tokens_per_second.map(|tps| sqlx::types::BigDecimal::from_f64(tps).unwrap_or_default()),
        response.error_info.as_ref().map(|e| e.error_type.as_str()),
        response.error_info.as_ref().map(|e| e.error_message.as_str())
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 更新API Key最后使用时间
    sqlx::query!(
        "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
        api_key_info.id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(())
}