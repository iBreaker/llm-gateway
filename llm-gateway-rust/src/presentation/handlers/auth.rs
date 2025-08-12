//! 认证处理器
//! 
//! 处理用户登录、注销、token刷新等认证相关请求

use axum::{
    extract::{State, ConnectInfo},
    response::Json,
    Extension,
    http::HeaderMap,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};
use crate::auth::{jwt::JwtService, password, Claims};
use crate::business::services::SharedSettingsService;
use sqlx::types::ipnetwork::IpNetwork;

/// 创建JWT服务实例（使用设置中的过期时间）
async fn create_jwt_service(settings: &SharedSettingsService) -> JwtService {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());
    let expiry_hours = settings.get_token_expiry_hours().await;
    JwtService::new_with_expiry(&secret, "llm-gateway".to_string(), expiry_hours as u64)
}

/// 登录请求
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    #[serde(alias = "username")]
    pub email: String,
    pub password: String,
}

/// 登录响应
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub user: UserInfo,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}

/// 用户信息
#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub is_active: bool,
}

/// Token刷新请求
#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

/// Token刷新响应
#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: i64,
}

/// 用户登录
#[instrument(skip(app_state, request, headers))]
pub async fn login(
    State(app_state): State<crate::presentation::routes::AppState>,
    ConnectInfo(addr): ConnectInfo<std::net::SocketAddr>,
    headers: HeaderMap,
    Json(request): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    let database = &app_state.database;
    let settings = &app_state.settings_service;
    info!("🔐 用户登录请求: {} (来源: {})", request.email, addr.ip());

    // 验证输入
    if request.email.is_empty() || request.password.is_empty() {
        return Err(AppError::Validation("邮箱和密码不能为空".to_string()));
    }

    let client_ip = addr.ip();
    let user_agent = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    // 检查登录失败次数
    let max_login_attempts = settings.get_max_login_attempts().await;
    let recent_failed_attempts = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM login_attempts 
         WHERE email = $1 AND success = false 
         AND attempt_time > NOW() - INTERVAL '1 hour'",
        request.email
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?
    .unwrap_or(0);

    if recent_failed_attempts >= max_login_attempts as i64 {
        // 记录被锁定的登录尝试
        record_login_attempt(
            &database,
            &request.email,
            client_ip,
            user_agent.as_deref(),
            false,
            Some("too_many_attempts"),
        ).await?;

        warn!("账号被锁定: {} ({} 次失败尝试)", request.email, recent_failed_attempts);
        return Err(AppError::Authentication(
            crate::auth::AuthError::AccountLocked(format!("登录失败次数过多，请1小时后重试 ({}次失败)", recent_failed_attempts))
        ));
    }

    // 查询用户 (支持email或username登录)
    let user_row = sqlx::query!(
        "SELECT id, username, email, password_hash, is_active, created_at, updated_at 
         FROM users WHERE email = $1 OR username = $1",
        request.email
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let user_row = user_row.ok_or_else(|| {
        warn!("用户不存在: {}", request.email);
        AppError::Authentication(crate::infrastructure::AuthError::InvalidCredentials)
    })?;

    // 验证密码
    let is_valid = password::verify_password(&request.password, &user_row.password_hash)
        .map_err(|e| AppError::Authentication(crate::auth::AuthError::Password(e.to_string())))?;

    if !is_valid {
        // 记录登录失败
        record_login_attempt(
            &database,
            &request.email,
            client_ip,
            user_agent.as_deref(),
            false,
            Some("invalid_credentials"),
        ).await?;

        warn!("密码错误: {}", request.email);
        return Err(AppError::Authentication(crate::auth::AuthError::InvalidCredentials));
    }

    // 检查用户是否激活
    if !user_row.is_active {
        warn!("用户已禁用: {}", request.email);
        return Err(AppError::Authentication(crate::auth::AuthError::UserNotFound));
    }

    // 更新最后登录时间
    sqlx::query!(
        "UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1",
        user_row.id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 生成JWT token（使用动态过期时间）
    let jwt_service = create_jwt_service(&settings).await;
    let access_token = jwt_service.generate_token(user_row.id, &user_row.username)
        .map_err(AppError::Authentication)?;

    // 生成refresh token (使用相同的token，在生产环境中应该使用不同的过期时间)
    let refresh_token = jwt_service.generate_token(user_row.id, &user_row.username)
        .map_err(AppError::Authentication)?;

    // 记录登录成功
    record_login_attempt(
        &database,
        &request.email,
        client_ip,
        user_agent.as_deref(),
        true,
        None,
    ).await?;

    info!("✅ 用户登录成功: {} (ID: {})", user_row.username, user_row.id);

    // 获取动态过期时间
    let expiry_hours = settings.get_token_expiry_hours().await;
    let expires_in = (expiry_hours * 3600) as i64; // 转换为秒

    let response = LoginResponse {
        user: UserInfo {
            id: user_row.id,
            username: user_row.username,
            email: user_row.email,
            is_active: user_row.is_active,
        },
        access_token,
        refresh_token,
        expires_in,
    };

    Ok(Json(response))
}

/// 获取当前用户信息
#[instrument(skip(app_state))]
pub async fn get_current_user(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<UserInfo>> {
    let database = &app_state.database;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    let user_row = sqlx::query!(
        "SELECT id, username, email, is_active FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let user_row = user_row.ok_or_else(|| {
        AppError::Authentication(crate::infrastructure::AuthError::UserNotFound)
    })?;

    let user_info = UserInfo {
        id: user_row.id,
        username: user_row.username,
        email: user_row.email,
        is_active: user_row.is_active,
    };

    Ok(Json(user_info))
}

/// 刷新Token
#[instrument(skip(app_state, request))]
pub async fn refresh_token(
    State(app_state): State<crate::presentation::routes::AppState>,
    Json(request): Json<RefreshTokenRequest>,
) -> AppResult<Json<TokenResponse>> {
    let database = &app_state.database;
    let settings = &app_state.settings_service;
    info!("🔄 Token刷新请求");

    // 验证refresh token
    let jwt_service = create_jwt_service(&settings).await;
    let claims = jwt_service.verify_token(&request.refresh_token)
        .map_err(AppError::Authentication)?;

    // 验证用户是否存在且激活
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    let user_exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND is_active = true)",
        user_id
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?
    .unwrap_or(false);

    if !user_exists {
        return Err(AppError::Authentication(crate::auth::AuthError::UserNotFound));
    }

    // 生成新的tokens
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;
    
    let access_token = jwt_service.generate_token(user_id, &claims.username)
        .map_err(AppError::Authentication)?;
    
    let refresh_token = jwt_service.generate_token(user_id, &claims.username)
        .map_err(AppError::Authentication)?;

    info!("✅ Token刷新成功: 用户ID {}", user_id);

    // 获取动态过期时间
    let expiry_hours = settings.get_token_expiry_hours().await;
    let expires_in = (expiry_hours * 3600) as i64;

    let response = TokenResponse {
        access_token,
        refresh_token,
        expires_in,
    };

    Ok(Json(response))
}

/// 用户登出
#[instrument(skip(_app_state))]
pub async fn logout(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    info!("👋 用户登出: {} (ID: {})", claims.username, claims.sub);

    // 在实际实现中，可以将token加入黑名单
    // 这里简化处理，只记录日志

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "登出成功"
    })))
}

/// 修改密码
#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub old_password: String,
    pub new_password: String,
}

#[instrument(skip(app_state, request))]
pub async fn change_password(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<ChangePasswordRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let database = &app_state.database;
    let settings = &app_state.settings_service;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    info!("🔒 用户修改密码: {} (ID: {})", claims.username, user_id);

    // 验证密码强度（使用配置的最小长度）
    let min_password_length = settings.get_password_min_length().await;
    if request.new_password.len() < min_password_length as usize {
        return Err(AppError::Validation(format!("新密码至少需要{}位字符", min_password_length)));
    }

    // 获取当前密码哈希
    let current_hash = sqlx::query_scalar!(
        "SELECT password_hash FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?
    .ok_or_else(|| AppError::Authentication(crate::infrastructure::AuthError::UserNotFound))?;

    // 验证旧密码
    let is_valid = password::verify_password(&request.old_password, &current_hash)
        .map_err(|e| AppError::Authentication(crate::auth::AuthError::Password(e.to_string())))?;

    if !is_valid {
        warn!("旧密码验证失败: 用户ID {}", user_id);
        return Err(AppError::Authentication(crate::auth::AuthError::InvalidCredentials));
    }

    // 生成新密码哈希
    let new_hash = password::hash_password(&request.new_password)
        .map_err(|e| AppError::Authentication(crate::auth::AuthError::Password(e.to_string())))?;

    // 更新密码
    sqlx::query!(
        "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
        new_hash,
        user_id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("✅ 密码修改成功: 用户ID {}", user_id);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "密码修改成功"
    })))
}

/// 记录登录尝试
async fn record_login_attempt(
    database: &Database,
    email: &str,
    ip_address: std::net::IpAddr,
    user_agent: Option<&str>,
    success: bool,
    failure_reason: Option<&str>,
) -> AppResult<()> {
    sqlx::query!(
        r#"
        INSERT INTO login_attempts (email, ip_address, user_agent, success, failure_reason)
        VALUES ($1, $2, $3, $4, $5)
        "#,
        email,
        IpNetwork::from(ip_address),
        user_agent,
        success,
        failure_reason
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(())
}