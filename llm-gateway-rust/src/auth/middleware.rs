//! 认证中间件模块

use axum::{
    extract::{Request, State},
    http::HeaderMap,
    middleware::Next,
    response::Response,
};
use chrono::{DateTime, Utc};

use crate::infrastructure::Database;
use crate::shared::AppError;
use super::AuthError;
use crate::business::services::{SharedRateLimitService, RateLimitResult};

/// API Key信息
#[derive(Debug, Clone)]
pub struct ApiKeyInfo {
    pub id: i64,
    pub user_id: i64,
    pub name: String,
    pub permissions: Vec<String>,
    pub rate_limit: Option<i32>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
}

/// 上游API Key的包装器
#[derive(Debug, Clone)]
pub struct UpstreamApiKey(pub String);

/// JWT认证中间件
pub async fn auth_middleware(
    State(app_state): State<crate::presentation::routes::AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let database = &app_state.database;
    let headers = request.headers();
    
    // 从Authorization header中提取token
    let token = extract_bearer_token(headers)
        .ok_or_else(|| AppError::Authentication(AuthError::InvalidToken))?;

    // 验证JWT token
    let jwt_service = crate::auth::jwt::JwtService::new(
        &std::env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string()),
        "llm-gateway".to_string(),
    );

    let claims = jwt_service.verify_token(&token)
        .map_err(AppError::Authentication)?;

    // 验证用户是否存在且活跃
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(AuthError::InvalidToken))?;

    let user = sqlx::query!(
        "SELECT id, is_active FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::Authentication(AuthError::UserNotFound))?;

    if !user.is_active {
        return Err(AppError::Authentication(AuthError::InvalidCredentials));
    }

    // 将Claims添加到请求扩展中
    request.extensions_mut().insert(claims);

    Ok(next.run(request).await)
}

/// API Key认证中间件
pub async fn api_key_middleware(
    State(app_state): State<crate::presentation::routes::AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let database = &app_state.database;
    let headers = request.headers();
    
    // 从多个可能的header中提取API key
    let api_key = extract_api_key(headers)
        .ok_or_else(|| AppError::Authentication(AuthError::ApiKeyNotFound))?;

    // 验证API Key
    match validate_api_key(&database, &api_key).await {
        Ok(api_key_info) => {
            // 检查速率限制
            if let Some(rate_limit_service) = request.extensions().get::<SharedRateLimitService>() {
                match rate_limit_service.check_rate_limit(api_key_info.id).await {
                    RateLimitResult::Allowed => {},
                    RateLimitResult::MinuteLimitExceeded { limit, reset_in_seconds } => {
                        return Err(AppError::RateLimitExceeded {
                            limit,
                            reset_in_seconds,
                            limit_type: "minute".to_string(),
                        });
                    },
                    RateLimitResult::DailyLimitExceeded { limit, reset_in_seconds } => {
                        return Err(AppError::RateLimitExceeded {
                            limit,
                            reset_in_seconds,
                            limit_type: "daily".to_string(),
                        });
                    },
                }
            }
            // 将API Key信息添加到请求扩展中
            request.extensions_mut().insert(api_key_info);
        },
        Err(AppError::Authentication(AuthError::ApiKeyNotFound)) => {
            // 如果作为网关Key未找到，则假定为上游Key，并传递给下游处理器
            request.extensions_mut().insert(UpstreamApiKey(api_key));
        },
        Err(e) => {
            // 其他错误（如数据库连接问题）则直接返回
            return Err(e);
        }
    }

    Ok(next.run(request).await)
}

/// 从Authorization header中提取Bearer token
fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|auth_header| {
            if auth_header.starts_with("Bearer ") {
                Some(auth_header[7..].to_string())
            } else {
                None
            }
        })
}

/// 从多个可能的header中提取API key
fn extract_api_key(headers: &HeaderMap) -> Option<String> {
    // 尝试从不同的header中获取API key
    headers
        .get("x-api-key")
        .or_else(|| headers.get("authorization"))
        .and_then(|value| value.to_str().ok())
        .map(|s| {
            // 如果是Bearer token格式，提取token部分
            if s.starts_with("Bearer ") {
                s[7..].to_string()
            } else {
                s.to_string()
            }
        })
}

/// 验证API Key
async fn validate_api_key(
    database: &Database,
    api_key: &str,
) -> Result<ApiKeyInfo, AppError> {
    // 计算API key的hash (在实际应用中，API key应该被哈希存储)
    let key_hash = format!("{:x}", md5::compute(api_key));

    let key_record = sqlx::query!(
        r#"
        SELECT ak.id, ak.user_id, ak.name, ak.permissions, 
               ak.rate_limit, ak.last_used_at, ak.expires_at,
               u.is_active as user_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.is_active = true
        "#,
        key_hash
    )
    .fetch_optional(database.pool())
    .await
    .map_err(AppError::Database)?
    .ok_or_else(|| AppError::Authentication(AuthError::ApiKeyNotFound))?;

    // 检查用户是否活跃
    if !key_record.user_active {
        return Err(AppError::Authentication(AuthError::InvalidCredentials));
    }

    // 检查API key是否过期
    if let Some(expires_at) = key_record.expires_at {
        if expires_at < Utc::now() {
            return Err(AppError::Authentication(AuthError::ApiKeyExpired));
        }
    }

    Ok(ApiKeyInfo {
        id: key_record.id,
        user_id: key_record.user_id,
        name: key_record.name,
        permissions: key_record.permissions,
        rate_limit: key_record.rate_limit,
        last_used_at: key_record.last_used_at,
        expires_at: key_record.expires_at,
    })
}