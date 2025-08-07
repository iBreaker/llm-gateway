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
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, error, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};
use crate::auth::middleware::ApiKeyInfo;
use crate::business::services::{
    IntelligentProxy, RequestFeatures, RequestPriority, RequestType,
    intelligent_proxy::{ProxyRequest as ServiceProxyRequest, ProxyResponse as ServiceProxyResponse}
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
#[instrument(skip(database, headers, body))]
pub async fn proxy_messages(
    State(database): State<Database>,
    Extension(api_key_info): Extension<ApiKeyInfo>,
    headers: HeaderMap,
    body: String,
) -> AppResult<Response> {
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
            record_usage_stats_simple(&database, &api_key_info, &service_response).await?;
            
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
            
            info!("🔍 [{}] [下游响应构建] 响应体大小: {} bytes", request_id, service_response.body.len());
            
            // 如果是SSE响应，详细分析内容
            if is_sse {
                info!("🔍 [{}] [SSE响应分析] 开始分析SSE响应内容", request_id);
                
                if service_response.body.is_empty() {
                    error!("❌ [{}] [SSE响应分析] SSE响应体为空！这可能是问题根源", request_id);
                } else if let Ok(body_str) = std::str::from_utf8(&service_response.body) {
                    // 分析SSE响应的结构
                    let lines: Vec<&str> = body_str.lines().collect();
                    info!("🔍 [SSE响应分析] SSE响应行数: {}", lines.len());
                    
                    let mut event_count = 0;
                    let mut data_chunks = 0;
                    
                    for (i, line) in lines.iter().enumerate() {
                        if line.starts_with("event:") {
                            event_count += 1;
                            if i < 10 || event_count <= 5 {
                                info!("🔍 [SSE响应分析] Event[{}]: {}", event_count, line);
                            }
                        } else if line.starts_with("data:") {
                            data_chunks += 1;
                            if i < 10 || data_chunks <= 5 {
                                info!("🔍 [SSE响应分析] Data[{}]: {}", data_chunks, line.chars().take(100).collect::<String>());
                            }
                        } else if !line.is_empty() {
                            if i < 10 {
                                info!("🔍 [SSE响应分析] Other[{}]: {}", i, line);
                            }
                        }
                    }
                    
                    info!("🔍 [SSE响应分析] 总计事件: {}, 数据块: {}", event_count, data_chunks);
                    
                    // 检查是否以正确的结束标记结尾
                    if let Some(last_line) = lines.last() {
                        info!("🔍 [SSE响应分析] 最后一行: '{}'", last_line);
                    }
                    
                    // 打印完整内容（如果不太大）
                    if body_str.len() <= 2000 {
                        info!("🔍 [SSE响应分析] 完整SSE内容:\n{}", body_str);
                    } else {
                        info!("🔍 [SSE响应分析] SSE内容过大({} bytes)，显示前1000字符:\n{}", 
                              body_str.len(), body_str.chars().take(1000).collect::<String>());
                    }
                } else {
                    error!("❌ [SSE响应分析] SSE响应包含非UTF-8数据，前200字节: {:?}", 
                           &service_response.body[..service_response.body.len().min(200)]);
                }
            } else {
                info!("🔍 [普通响应] 非SSE响应，Content-Type: {:?}", 
                      service_response.headers.get("content-type"));
                if service_response.body.len() <= 1000 {
                    if let Ok(body_str) = std::str::from_utf8(&service_response.body) {
                        info!("🔍 [普通响应] 响应内容: {}", body_str);
                    }
                }
            }
            
            // 直接返回上游响应，不做解析和转换
            let response = {
                let mut response_builder = Response::builder()
                    .status(StatusCode::from_u16(service_response.status).unwrap_or(StatusCode::OK));
                    
                info!("🔍 [下游响应构建] 开始构建最终响应，状态码: {}", service_response.status);
                
                // 添加响应头
                let mut header_count = 0;
                for (key, value) in &service_response.headers {
                    match response_builder.headers_mut() {
                        Some(headers) => {
                            if let (Ok(header_name), Ok(header_value)) = (
                                key.parse::<axum::http::HeaderName>(),
                                value.parse::<axum::http::HeaderValue>()
                            ) {
                                headers.insert(header_name, header_value);
                                header_count += 1;
                                info!("🔍 [下游响应构建] ✓ 成功添加头部: '{}' = '{}'", key, value);
                            } else {
                                error!("❌ [下游响应构建] 无法解析头部: '{}' = '{}'", key, value);
                            }
                        }
                        None => {
                            response_builder = response_builder.header(key, value);
                            header_count += 1;
                            info!("🔍 [下游响应构建] ✓ 备用方式添加头部: '{}' = '{}'", key, value);
                        }
                    }
                }
                
                info!("🔍 [下游响应构建] 成功添加 {} 个响应头部", header_count);
                
                if is_sse {
                    info!("🔍 [下游响应构建] SSE响应，创建真正的流式响应");
                    // 核心修复：将SSE数据转换为流式chunks
                    use futures_util::stream::{self};
                    
                    // 将整个响应体按事件边界分块
                    let body_str = std::str::from_utf8(&service_response.body)
                        .map_err(|e| AppError::Internal(format!("SSE响应不是有效UTF-8: {}", e)))?;
                    
                    let mut chunks = Vec::new();
                    let mut current_event = String::new();
                    
                    for line in body_str.lines() {
                        current_event.push_str(line);
                        current_event.push_str("\n");
                        
                        // 在空行处分割事件
                        if line.is_empty() && !current_event.trim().is_empty() {
                            chunks.push(current_event.clone().into_bytes());
                            current_event.clear();
                        }
                    }
                    
                    // 添加最后一个事件
                    if !current_event.trim().is_empty() {
                        chunks.push(current_event.into_bytes());
                    }
                    
                    // 创建一个流来逐个发送chunks
                    let stream = stream::iter(chunks.into_iter().map(|chunk| Ok::<_, std::convert::Infallible>(chunk)));
                    
                    response_builder
                        .header("cache-control", "no-cache")
                        .header("connection", "keep-alive")
                        .body(Body::from_stream(stream))
                        .map_err(|e| AppError::Internal(format!("构建流式响应失败: {}", e)))?
                } else {
                    // 否则，返回普通响应
                    response_builder
                        .body(Body::from(service_response.body.clone()))
                        .map_err(|e| AppError::Internal(format!("构建响应失败: {}", e)))?
                }
            };
                
            info!("🔍 [下游响应构建] ✅ 最终响应构建完成，准备返回给客户端");
            info!("🔍 [下游响应构建] 最终响应体大小: {} bytes", service_response.body.len());
            Ok(response)
        }
        Err(e) => {
            error!("❌ 代理请求失败: {}", e);
            
            // 记录失败统计
            record_failure_stats(&database, &api_key_info).await?;
            
            Err(e)
        }
    }
}

/// 获取可用模型列表
#[instrument(skip(database))]
pub async fn list_models(
    State(database): State<Database>,
    Extension(api_key_info): Extension<ApiKeyInfo>,
) -> AppResult<Json<ModelListResponse>> {
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
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO usage_records (
            api_key_id, request_method, request_path,
            response_status, tokens_used, cost_usd, latency_ms, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        "#,
        api_key_info.id,
        "POST",
        "/v1/messages",
        500i32,
        0i32,
        0.0,
        0i32
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(())
}


/// 记录使用统计（简化版本）
async fn record_usage_stats_simple(
    database: &Database,
    api_key_info: &ApiKeyInfo,
    response: &ServiceProxyResponse,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO usage_records (
            api_key_id, upstream_account_id, request_method, request_path,
            response_status, tokens_used, cost_usd, latency_ms, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        "#,
        api_key_info.id,
        response.upstream_account_id,
        "POST",
        "/v1/messages",
        response.status as i32,
        response.tokens_used as i32,
        response.cost_usd,
        response.latency_ms as i32
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