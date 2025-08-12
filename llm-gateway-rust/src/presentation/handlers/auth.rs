//! 认证处理器
//! 
//! 处理用户登录、注销、token刷新等认证相关请求

use axum::{
    extract::State,
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::{info, warn, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};
use crate::auth::{jwt::JwtService, password, Claims};

/// 创建JWT服务实例
fn create_jwt_service() -> JwtService {
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());
    JwtService::new(&secret, "llm-gateway".to_string())
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
#[instrument(skip(database, request))]
pub async fn login(
    State(database): State<Database>,
    Json(request): Json<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    info!("🔐 用户登录请求: {}", request.email);

    // 验证输入
    if request.email.is_empty() || request.password.is_empty() {
        return Err(AppError::Validation("邮箱和密码不能为空".to_string()));
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

    // 生成JWT token
    let jwt_service = create_jwt_service();
    let access_token = jwt_service.generate_token(user_row.id, &user_row.username)
        .map_err(AppError::Authentication)?;

    // 生成refresh token (使用相同的token，在生产环境中应该使用不同的过期时间)
    let refresh_token = jwt_service.generate_token(user_row.id, &user_row.username)
        .map_err(AppError::Authentication)?;

    info!("✅ 用户登录成功: {} (ID: {})", user_row.username, user_row.id);

    let response = LoginResponse {
        user: UserInfo {
            id: user_row.id,
            username: user_row.username,
            email: user_row.email,
            is_active: user_row.is_active,
        },
        access_token,
        refresh_token,
        expires_in: 3600,
    };

    Ok(Json(response))
}

/// 获取当前用户信息
#[instrument(skip(database))]
pub async fn get_current_user(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<UserInfo>> {
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
#[instrument(skip(database, request))]
pub async fn refresh_token(
    State(database): State<Database>,
    Json(request): Json<RefreshTokenRequest>,
) -> AppResult<Json<TokenResponse>> {
    info!("🔄 Token刷新请求");

    // 验证refresh token
    let jwt_service = create_jwt_service();
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

    let response = TokenResponse {
        access_token,
        refresh_token,
        expires_in: 3600,
    };

    Ok(Json(response))
}

/// 用户登出
#[instrument(skip(_database))]
pub async fn logout(
    State(_database): State<Database>,
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

#[instrument(skip(database, request))]
pub async fn change_password(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<ChangePasswordRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    info!("🔒 用户修改密码: {} (ID: {})", claims.username, user_id);

    // 验证密码强度
    if request.new_password.len() < 8 {
        return Err(AppError::Validation("新密码至少需要8位字符".to_string()));
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