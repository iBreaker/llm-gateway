//! 用户管理处理器
//! 
//! 处理用户CRUD操作

use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};
use crate::auth::{password, Claims};

/// 用户信息
#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub role: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "lastLoginAt")]
    pub last_login_at: Option<String>,
}

/// 用户列表响应
#[derive(Debug, Serialize)]
pub struct UsersListResponse {
    pub users: Vec<UserInfo>,
    pub total: i64,
}

/// 创建用户请求
#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub email: String,
    pub username: String,
    pub password: String,
    pub role: String,
}

/// 更新用户请求
#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub email: String,
    pub username: String,
    pub role: String,
    #[serde(rename = "isActive")]
    pub is_active: bool,
    pub password: Option<String>, // 可选密码更新
}

/// 获取用户列表
#[instrument(skip(database))]
pub async fn list_users(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<UsersListResponse>> {
    info!("📋 获取用户列表请求: 用户ID {}", claims.sub);

    // 查询所有用户
    let users_rows = sqlx::query!(
        "SELECT id, username, email, is_active, created_at, updated_at 
         FROM users 
         ORDER BY created_at DESC"
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let users: Vec<UserInfo> = users_rows.into_iter().map(|row| {
        UserInfo {
            id: row.id,
            username: row.username,
            email: row.email,
            role: "USER".to_string(), // 默认角色，后续可从数据库获取
            is_active: row.is_active,
            created_at: row.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            last_login_at: None, // 后续可添加最后登录时间字段
        }
    }).collect();

    let total = users.len() as i64;

    info!("✅ 获取用户列表成功: {} 个用户", total);

    Ok(Json(UsersListResponse { users, total }))
}

/// 创建用户
#[instrument(skip(database, request))]
pub async fn create_user(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateUserRequest>,
) -> AppResult<Json<UserInfo>> {
    info!("👤 创建用户请求: {} (操作者: {})", request.email, claims.username);

    // 验证输入
    if request.email.is_empty() || request.username.is_empty() || request.password.is_empty() {
        return Err(AppError::Validation("邮箱、用户名和密码不能为空".to_string()));
    }

    if request.password.len() < 8 {
        return Err(AppError::Validation("密码至少需要8位字符".to_string()));
    }

    // 检查邮箱是否已存在
    let existing_user = sqlx::query!(
        "SELECT id FROM users WHERE email = $1 OR username = $2",
        request.email,
        request.username
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    if existing_user.is_some() {
        return Err(AppError::Business("邮箱或用户名已存在".to_string()));
    }

    // 生成密码哈希
    let password_hash = password::hash_password(&request.password)
        .map_err(|e| AppError::Authentication(crate::auth::AuthError::Password(e.to_string())))?;

    // 创建用户
    let user_row = sqlx::query!(
        "INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         RETURNING id, username, email, is_active, created_at",
        request.username,
        request.email,
        password_hash,
        true
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("✅ 用户创建成功: {} (ID: {})", user_row.username, user_row.id);

    let user_info = UserInfo {
        id: user_row.id,
        username: user_row.username,
        email: user_row.email,
        role: request.role,
        is_active: user_row.is_active,
        created_at: user_row.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        last_login_at: None,
    };

    Ok(Json(user_info))
}

/// 更新用户
#[instrument(skip(database, request))]
pub async fn update_user(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
    Json(request): Json<UpdateUserRequest>,
) -> AppResult<Json<UserInfo>> {
    info!("🔄 更新用户请求: ID {} (操作者: {})", user_id, claims.username);

    // 验证输入
    if request.email.is_empty() || request.username.is_empty() {
        return Err(AppError::Validation("邮箱和用户名不能为空".to_string()));
    }

    // 检查用户是否存在
    let existing_user = sqlx::query!(
        "SELECT id FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    if existing_user.is_none() {
        return Err(AppError::Business("用户不存在".to_string()));
    }

    // 检查是否有其他用户使用相同的邮箱或用户名
    let conflict_user = sqlx::query!(
        "SELECT id FROM users WHERE (email = $1 OR username = $2) AND id != $3",
        request.email,
        request.username,
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    if conflict_user.is_some() {
        return Err(AppError::Business("邮箱或用户名已被其他用户使用".to_string()));
    }

    // 如果提供了新密码，生成哈希
    let password_hash = if let Some(new_password) = &request.password {
        if !new_password.is_empty() {
            if new_password.len() < 8 {
                return Err(AppError::Validation("密码至少需要8位字符".to_string()));
            }
            Some(password::hash_password(new_password)
                .map_err(|e| AppError::Authentication(crate::auth::AuthError::Password(e.to_string())))?)
        } else {
            None
        }
    } else {
        None
    };

    // 更新用户信息
    if let Some(hash) = password_hash {
        sqlx::query!(
            "UPDATE users 
             SET username = $1, email = $2, is_active = $3, password_hash = $4, updated_at = NOW()
             WHERE id = $5",
            request.username,
            request.email,
            request.is_active,
            hash,
            user_id
        )
        .execute(database.pool())
        .await
        .map_err(|e| AppError::Database(e))?;
    } else {
        sqlx::query!(
            "UPDATE users 
             SET username = $1, email = $2, is_active = $3, updated_at = NOW()
             WHERE id = $4",
            request.username,
            request.email,
            request.is_active,
            user_id
        )
        .execute(database.pool())
        .await
        .map_err(|e| AppError::Database(e))?;
    }

    // 查询更新后的用户信息
    let updated_user = sqlx::query!(
        "SELECT id, username, email, is_active, created_at 
         FROM users WHERE id = $1",
        user_id
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("✅ 用户更新成功: {} (ID: {})", updated_user.username, updated_user.id);

    let user_info = UserInfo {
        id: updated_user.id,
        username: updated_user.username,
        email: updated_user.email,
        role: request.role,
        is_active: updated_user.is_active,
        created_at: updated_user.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        last_login_at: None,
    };

    Ok(Json(user_info))
}

/// 删除用户
#[instrument(skip(database))]
pub async fn delete_user(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🗑️ 删除用户请求: ID {} (操作者: {})", user_id, claims.username);

    // 检查是否试图删除自己
    let current_user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    if current_user_id == user_id {
        return Err(AppError::Business("不能删除自己".to_string()));
    }

    // 检查用户是否存在
    let existing_user = sqlx::query!(
        "SELECT username FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let username = match existing_user {
        Some(user) => user.username,
        None => return Err(AppError::Business("用户不存在".to_string())),
    };

    // 删除用户
    let result = sqlx::query!(
        "DELETE FROM users WHERE id = $1",
        user_id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    if result.rows_affected() == 0 {
        return Err(AppError::Business("删除用户失败".to_string()));
    }

    info!("✅ 用户删除成功: {} (ID: {})", username, user_id);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "用户删除成功"
    })))
}