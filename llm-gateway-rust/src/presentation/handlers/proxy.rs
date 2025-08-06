//! 智能代理处理器
//! 
//! 处理LLM API代理请求，集成智能路由和负载均衡

use axum::{
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
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
}

/// 消息结构
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
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
    info!("🚀 智能代理请求: API Key ID {}", api_key_info.id);

    // 解析请求体
    let request: ProxyMessageRequest = serde_json::from_str(&body)
        .map_err(|e| AppError::Validation(format!("请求体解析失败: {}", e)))?;

    // 获取用户信息
    let user = get_user_by_api_key(&database, &api_key_info).await?;

    // 分析请求特征
    let features = analyze_request_features(&request);

    // 获取可用的上游账号
    let available_accounts = get_available_upstream_accounts(&database, user.id).await?;

    if available_accounts.is_empty() {
        return Err(AppError::Business("没有可用的上游账号".to_string()));
    }

    // 构建服务层代理请求
    let service_request = ServiceProxyRequest {
        user: user.clone(),
        method: "POST".to_string(),
        path: "/v1/messages".to_string(),
        headers: headers_to_hashmap(&headers),
        body: Some(body.into_bytes()),
        features,
    };

    // 创建智能代理服务
    let proxy_service = IntelligentProxy::new();

    // 执行智能代理
    match proxy_service.proxy_request(service_request, &available_accounts).await {
        Ok(service_response) => {
            // 转换为API响应格式
            let api_response = convert_service_response_to_api(service_response, &request)?;
            
            // 记录使用统计
            record_usage_stats(&database, &api_key_info, &api_response).await?;
            
            info!("✅ 代理请求成功: 延迟 {}ms", api_response.routing_info.response_time_ms);
            
            Ok(Json(api_response).into_response())
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
            crate::business::domain::AccountProvider::ClaudeCode => {
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
            crate::business::domain::AccountProvider::GeminiCli => {
                models.push(ModelInfo {
                    id: "gemini-pro".to_string(),
                    name: "Gemini Pro".to_string(),
                    provider: "google".to_string(),
                    max_tokens: 32000,
                    cost_per_1k_tokens: 0.002,
                    capabilities: vec!["text".to_string(), "multimodal".to_string()],
                });
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
        WHERE user_id = $1 AND is_active = true
        ORDER BY last_health_check DESC
        "#,
        user_id
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let mut result = Vec::new();
    for row in accounts {
        let provider = match row.provider.as_str() {
            "claude_code" => crate::business::domain::AccountProvider::ClaudeCode,
            "gemini_cli" => crate::business::domain::AccountProvider::GeminiCli,
            _ => continue,
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
        .map(|msg| msg.content.len() / 4) // 粗略估算：4字符≈1token
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

/// 转换服务响应为API响应
fn convert_service_response_to_api(
    service_response: ServiceProxyResponse,
    original_request: &ProxyMessageRequest,
) -> AppResult<ProxyMessageResponse> {
    // 解析上游响应
    let response_text = String::from_utf8(service_response.body)
        .map_err(|e| AppError::Internal(format!("响应解析失败: {}", e)))?;

    // 这里简化处理，实际生产中需要根据不同提供商的响应格式进行转换
    let content_blocks = vec![ContentBlock {
        content_type: "text".to_string(),
        text: response_text,
    }];

    let provider_name = match service_response.routing_decision.selected_account.provider {
        crate::business::domain::AccountProvider::ClaudeCode => "anthropic",
        crate::business::domain::AccountProvider::GeminiCli => "google",
    };

    let response = ProxyMessageResponse {
        id: format!("msg_{}", uuid::Uuid::new_v4()),
        message_type: "message".to_string(),
        role: "assistant".to_string(),
        content: content_blocks,
        model: original_request.model.clone().unwrap_or_else(|| "claude-3-sonnet".to_string()),
        usage: Usage {
            input_tokens: service_response.tokens_used / 2, // 粗略分配
            output_tokens: service_response.tokens_used / 2,
            total_tokens: service_response.tokens_used,
            cost_usd: service_response.cost_usd,
        },
        routing_info: RoutingInfo {
            strategy: format!("{:?}", service_response.routing_decision.strategy_used),
            upstream_account_id: service_response.upstream_account_id,
            upstream_provider: provider_name.to_string(),
            confidence_score: service_response.routing_decision.confidence_score,
            response_time_ms: service_response.latency_ms,
            reasoning: service_response.routing_decision.reasoning,
        },
    };

    Ok(response)
}

/// 记录使用统计
async fn record_usage_stats(
    database: &Database,
    api_key_info: &ApiKeyInfo,
    response: &ProxyMessageResponse,
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
        response.routing_info.upstream_account_id,
        "POST",
        "/v1/messages",
        200i32,
        response.usage.total_tokens as i32,
        response.usage.cost_usd,
        response.routing_info.response_time_ms as i32
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