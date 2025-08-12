//! API Key管理处理器
//! 
//! 处理API Key的创建、查询、更新、删除操作

use axum::{
    extract::{Path, Query, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult, types::PaginationParams};
use crate::auth::Claims;
use crate::shared::utils::{generate_api_key, sha256_hash};
use crate::business::services::SharedSettingsService;

/// 创建API Key请求
#[derive(Debug, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    pub permissions: Vec<String>,
    pub expires_in_days: Option<u32>,
}

/// API Key响应
#[derive(Debug, Serialize)]
pub struct ApiKeyResponse {
    pub id: i64,
    pub name: String,
    pub key_preview: String, // 只显示前8位
    pub permissions: Vec<String>,
    pub is_active: bool,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// 创建API Key响应（包含完整key）
#[derive(Debug, Serialize)]
pub struct CreateApiKeyResponse {
    pub id: i64,
    pub name: String,
    pub api_key: String, // 完整的API Key，只在创建时返回
    pub permissions: Vec<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// 更新API Key请求
#[derive(Debug, Deserialize)]
pub struct UpdateApiKeyRequest {
    pub name: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub is_active: Option<bool>,
}

/// API Key列表响应
#[derive(Debug, Serialize)]
pub struct ApiKeyListResponse {
    pub api_keys: Vec<ApiKeyResponse>,
    pub total: u64,
    pub page: u32,
    pub size: u32,
}

/// 创建API Key
#[instrument(skip(app_state, request))]
pub async fn create_api_key(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateApiKeyRequest>,
) -> AppResult<Json<CreateApiKeyResponse>> {
    let database = &app_state.database;
    let settings = &app_state.settings_service;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    info!("🔑 创建API Key: {} (用户: {})", request.name, claims.username);

    // 验证输入
    if request.name.trim().is_empty() {
        return Err(AppError::Validation("API Key名称不能为空".to_string()));
    }

    if request.name.len() > 50 {
        return Err(AppError::Validation("API Key名称不能超过50个字符".to_string()));
    }

    if request.permissions.is_empty() {
        return Err(AppError::Validation("至少需要指定一个权限".to_string()));
    }

    // 检查用户API Key数量限制
    let max_api_keys = settings.get_max_api_keys().await;
    let current_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = true",
        user_id
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?
    .unwrap_or(0);

    if current_count >= max_api_keys as i64 {
        return Err(AppError::Business(format!("API密钥数量已达上限 ({})", max_api_keys)));
    }

    // 生成API Key
    let api_key = generate_api_key();
    let key_hash = sha256_hash(&api_key);

    // 计算过期时间
    let expires_at = request.expires_in_days.map(|days| {
        chrono::Utc::now() + chrono::Duration::days(days as i64)
    });

    // 序列化权限
    let _permissions_json = serde_json::to_value(&request.permissions)
        .map_err(|e| AppError::Internal(format!("权限序列化失败: {}", e)))?;

    // 插入数据库
    let result = sqlx::query!(
        r#"
        INSERT INTO api_keys (user_id, name, key_hash, permissions, expires_at, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
        RETURNING id, created_at
        "#,
        user_id,
        request.name.trim(),
        key_hash,
        &request.permissions,
        expires_at
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("✅ API Key创建成功: {} (ID: {})", request.name, result.id);

    let response = CreateApiKeyResponse {
        id: result.id,
        name: request.name,
        api_key, // 只在创建时返回完整key
        permissions: request.permissions,
        expires_at,
        created_at: result.created_at,
    };

    Ok(Json(response))
}

/// 获取用户的API Key列表
#[instrument(skip(app_state))]
pub async fn list_api_keys(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Query(pagination): Query<PaginationParams>,
) -> AppResult<Json<ApiKeyListResponse>> {
    let database = &app_state.database;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    // 验证分页参数
    pagination.validate().map_err(|e| AppError::Validation(e))?;

    let offset = pagination.offset() as i64;
    let limit = pagination.limit() as i64;

    // 查询API Keys
    let api_keys = sqlx::query!(
        r#"
        SELECT id, name, key_hash, permissions, is_active, expires_at, created_at, last_used_at
        FROM api_keys 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
        "#,
        user_id,
        limit,
        offset
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 获取总数
    let total = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM api_keys WHERE user_id = $1",
        user_id
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?
    .unwrap_or(0) as u64;

    // 转换响应格式
    let api_key_responses: Vec<ApiKeyResponse> = api_keys
        .into_iter()
        .map(|row| {
            let permissions: Vec<String> = row.permissions;
            
            // 生成key预览（前8位 + ****）
            let key_preview = if row.key_hash.len() >= 8 {
                format!("{}****", &row.key_hash[..8])
            } else {
                "****".to_string()
            };

            ApiKeyResponse {
                id: row.id,
                name: row.name,
                key_preview,
                permissions,
                is_active: row.is_active,
                expires_at: row.expires_at.map(|dt| dt),
                created_at: row.created_at,
                last_used_at: row.last_used_at.map(|dt| dt),
            }
        })
        .collect();

    let response = ApiKeyListResponse {
        api_keys: api_key_responses,
        total,
        page: pagination.page,
        size: pagination.size,
    };

    Ok(Json(response))
}

/// 获取单个API Key详情
#[instrument(skip(app_state))]
pub async fn get_api_key(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
) -> AppResult<Json<ApiKeyResponse>> {
    let database = &app_state.database;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    let api_key = sqlx::query!(
        r#"
        SELECT id, name, key_hash, permissions, is_active, expires_at, created_at, last_used_at
        FROM api_keys 
        WHERE id = $1 AND user_id = $2
        "#,
        key_id,
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let api_key = api_key.ok_or_else(|| {
        AppError::NotFound("API Key不存在".to_string())
    })?;

    let permissions: Vec<String> = api_key.permissions;
    
    let key_preview = if api_key.key_hash.len() >= 8 {
        format!("{}****", &api_key.key_hash[..8])
    } else {
        "****".to_string()
    };

    let response = ApiKeyResponse {
        id: api_key.id,
        name: api_key.name,
        key_preview,
        permissions,
        is_active: api_key.is_active,
        expires_at: api_key.expires_at.map(|dt| dt),
        created_at: api_key.created_at,
        last_used_at: api_key.last_used_at.map(|dt| dt),
    };

    Ok(Json(response))
}

/// 更新API Key
#[instrument(skip(app_state, request))]
pub async fn update_api_key(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
    Json(request): Json<UpdateApiKeyRequest>,
) -> AppResult<Json<ApiKeyResponse>> {
    let database = &app_state.database;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    info!("🔧 更新API Key: ID {} (用户: {})", key_id, claims.username);

    // 检查API Key是否存在
    let existing_key = sqlx::query!(
        "SELECT id FROM api_keys WHERE id = $1 AND user_id = $2",
        key_id,
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    if existing_key.is_none() {
        return Err(AppError::NotFound("API Key不存在".to_string()));
    }

    // 简化更新逻辑，只支持名称更新
    if let Some(name) = &request.name {
        if name.trim().is_empty() {
            return Err(AppError::Validation("API Key名称不能为空".to_string()));
        }
        if name.len() > 50 {
            return Err(AppError::Validation("API Key名称不能超过50个字符".to_string()));
        }
        
        sqlx::query!(
            "UPDATE api_keys SET name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3",
            name,
            key_id,
            claims.sub.parse::<i64>().unwrap_or(0)
        )
        .execute(database.pool())
        .await
        .map_err(AppError::Database)?;
    }

    if let Some(permissions) = &request.permissions {
        if permissions.is_empty() {
            return Err(AppError::Validation("至少需要指定一个权限".to_string()));
        }
        
        sqlx::query!(
            "UPDATE api_keys SET permissions = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3",
            permissions,
            key_id,
            claims.sub.parse::<i64>().unwrap_or(0)
        )
        .execute(database.pool())
        .await
        .map_err(AppError::Database)?;
    }

    if let Some(is_active) = request.is_active {
        sqlx::query!(
            "UPDATE api_keys SET is_active = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3",
            is_active,
            key_id,
            claims.sub.parse::<i64>().unwrap_or(0)
        )
        .execute(database.pool())
        .await
        .map_err(AppError::Database)?;
    }

    info!("✅ API Key更新成功: ID {}", key_id);

    // 返回更新后的API Key信息
    get_api_key(State(app_state.clone()), Extension(claims), Path(key_id)).await
}

/// 删除API Key
#[instrument(skip(app_state))]
pub async fn delete_api_key(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let database = &app_state.database;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    info!("🗑️ 删除API Key: ID {} (用户: {})", key_id, claims.username);

    // 执行删除
    let result = sqlx::query!(
        "DELETE FROM api_keys WHERE id = $1 AND user_id = $2",
        key_id,
        user_id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("API Key不存在".to_string()));
    }

    info!("✅ API Key删除成功: ID {}", key_id);

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "API Key删除成功"
    })))
}

/// 重新生成API Key
#[instrument(skip(app_state))]
pub async fn regenerate_api_key(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(key_id): Path<i64>,
) -> AppResult<Json<CreateApiKeyResponse>> {
    let database = &app_state.database;
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Authentication(crate::auth::AuthError::InvalidToken))?;

    info!("🔄 重新生成API Key: ID {} (用户: {})", key_id, claims.username);

    // 获取现有API Key信息
    let existing_key = sqlx::query!(
        r#"
        SELECT name, permissions, expires_at, created_at
        FROM api_keys 
        WHERE id = $1 AND user_id = $2
        "#,
        key_id,
        user_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let existing_key = existing_key.ok_or_else(|| {
        AppError::NotFound("API Key不存在".to_string())
    })?;

    // 生成新的API Key
    let new_api_key = generate_api_key();
    let new_key_hash = sha256_hash(&new_api_key);

    // 更新数据库
    sqlx::query!(
        "UPDATE api_keys SET key_hash = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3",
        new_key_hash,
        key_id,
        user_id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("✅ API Key重新生成成功: ID {}", key_id);

    let permissions: Vec<String> = existing_key.permissions;

    let response = CreateApiKeyResponse {
        id: key_id,
        name: existing_key.name,
        api_key: new_api_key, // 返回新生成的完整key
        permissions,
        expires_at: existing_key.expires_at.map(|dt| dt),
        created_at: existing_key.created_at,
    };

    Ok(Json(response))
}