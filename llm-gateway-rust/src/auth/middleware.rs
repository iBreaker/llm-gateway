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
    use tracing::{info, error, debug};
    
    let database = &app_state.database;
    let headers = request.headers();
    
    // 调试：打印所有头部信息
    debug!("🔍 [API Key认证] 收到请求头部:");
    for (key, value) in headers.iter() {
        let value_str = value.to_str().unwrap_or("<无效UTF-8>");
        if key.as_str().to_lowercase().contains("key") || key.as_str().to_lowercase().contains("auth") {
            let masked_value = if value_str.len() > 10 {
                format!("{}...{}", &value_str[..6], &value_str[value_str.len()-4..])
            } else {
                value_str.to_string()
            };
            debug!("🔍 [API Key认证] {}: {}", key.as_str(), masked_value);
        } else {
            debug!("🔍 [API Key认证] {}: {}", key.as_str(), value_str);
        }
    }
    
    // 从多个可能的header中提取API key
    let api_key = match extract_api_key(headers) {
        Some(key) => {
            info!("🔍 [API Key认证] 成功提取API Key，长度: {}, 前缀: {}", 
                  key.len(), 
                  if key.len() > 10 { &key[..10] } else { &key });
            key
        },
        None => {
            error!("❌ [API Key认证] 未找到API Key - 检查了以下头部: x-api-key, anthropic-api-key, authorization");
            return Err(AppError::Authentication(AuthError::ApiKeyNotFound));
        }
    };

    // 验证API Key
    info!("🔍 [API Key认证] 开始验证API Key");
    match validate_api_key(&database, &api_key).await {
        Ok(api_key_info) => {
            info!("✅ [API Key认证] API Key验证成功 - 用户ID: {}, Key名称: {}", 
                  api_key_info.user_id, api_key_info.name);
            
            // 检查速率限制
            if let Some(rate_limit_service) = request.extensions().get::<SharedRateLimitService>() {
                match rate_limit_service.check_rate_limit(api_key_info.id).await {
                    RateLimitResult::Allowed => {},
                    RateLimitResult::MinuteLimitExceeded { limit, reset_in_seconds } => {
                        error!("❌ [API Key认证] 速率限制超出 - 分钟限制: {}", limit);
                        return Err(AppError::RateLimitExceeded {
                            limit,
                            reset_in_seconds,
                            limit_type: "minute".to_string(),
                        });
                    },
                    RateLimitResult::DailyLimitExceeded { limit, reset_in_seconds } => {
                        error!("❌ [API Key认证] 速率限制超出 - 日限制: {}", limit);
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
            info!("🔄 [API Key认证] 网关Key未找到，假定为上游Key并传递给代理处理器");
            // 如果作为网关Key未找到，则假定为上游Key，并传递给下游处理器
            request.extensions_mut().insert(UpstreamApiKey(api_key));
        },
        Err(e) => {
            error!("❌ [API Key认证] 验证失败: {:?}", e);
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
        .or_else(|| headers.get("anthropic-api-key"))  // 支持anthropic-api-key头部
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
    use tracing::{info, error, debug};
    
    debug!("🔍 [validate_api_key] 开始验证API Key，长度: {}", api_key.len());
    
    // 计算API key的hash (在实际应用中，API key应该被哈希存储)
    let key_hash = format!("{:x}", md5::compute(api_key));
    debug!("🔍 [validate_api_key] API Key hash: {}", key_hash);

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
    .map_err(|e| {
        error!("❌ [validate_api_key] 数据库查询失败: {:?}", e);
        AppError::Database(e)
    })?;
    
    let key_record = match key_record {
        Some(record) => {
            info!("✅ [validate_api_key] 找到匹配的API Key记录 - ID: {}, 用户ID: {}", record.id, record.user_id);
            record
        },
        None => {
            error!("❌ [validate_api_key] 未找到匹配的API Key记录 - hash: {}", key_hash);
            return Err(AppError::Authentication(AuthError::ApiKeyNotFound));
        }
    };

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