use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn, instrument};

use crate::{
    auth::Claims,
    infrastructure::database::Database,
    shared::error::{AppError, AppResult},
    business::services::SharedSettingsService,
};

/// 系统设置响应
#[derive(Debug, Serialize)]
pub struct SystemSettingsResponse {
    // 基础设置
    pub system_name: String,
    pub description: String,
    pub max_users: i32,
    pub max_api_keys: i32,
    
    // 安全设置
    pub password_min_length: i32,
    pub token_expiry_hours: i32,
    pub max_login_attempts: i32,
    
    // 限流设置
    pub rate_limit_per_minute: i32,
    pub max_requests_per_day: i32,
    
    // 缓存设置
    pub cache_enabled: bool,
    pub cache_ttl_minutes: i32,
    
    // 日志设置
    pub log_level: String,
    pub log_retention_days: i32,
    
    // 通知设置
    pub email_notifications: bool,
    pub webhook_notifications: bool,
    pub alert_threshold: i32,
}

/// 更新设置请求
#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    // 基础设置
    pub system_name: Option<String>,
    pub description: Option<String>,
    pub max_users: Option<i32>,
    pub max_api_keys: Option<i32>,
    
    // 安全设置
    pub password_min_length: Option<i32>,
    pub token_expiry_hours: Option<i32>,
    pub max_login_attempts: Option<i32>,
    
    // 限流设置
    pub rate_limit_per_minute: Option<i32>,
    pub max_requests_per_day: Option<i32>,
    
    // 缓存设置
    pub cache_enabled: Option<bool>,
    pub cache_ttl_minutes: Option<i32>,
    
    // 日志设置
    pub log_level: Option<String>,
    pub log_retention_days: Option<i32>,
    
    // 通知设置
    pub email_notifications: Option<bool>,
    pub webhook_notifications: Option<bool>,
    pub alert_threshold: Option<i32>,
}

/// 单个设置项
#[derive(Debug, Serialize)]
pub struct SettingItem {
    pub key: String,
    pub value: String,
    pub description: Option<String>,
    pub category: String,
    pub value_type: String,
}

/// 获取所有系统设置
#[instrument(skip(database))]
pub async fn get_settings(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<SystemSettingsResponse>> {
    info!("⚙️ 获取系统设置请求: 用户ID {}", claims.sub);

    // 查询所有设置
    let settings_rows = sqlx::query!(
        "SELECT key, value, description, category, value_type 
         FROM system_settings 
         ORDER BY category, key"
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 转换为HashMap方便查找
    let settings: HashMap<String, String> = settings_rows
        .into_iter()
        .map(|row| (row.key, row.value))
        .collect();

    // 构建响应
    let response = SystemSettingsResponse {
        // 基础设置
        system_name: settings.get("system_name").unwrap_or(&"LLM Gateway".to_string()).clone(),
        description: settings.get("system_description").unwrap_or(&"智能大语言模型网关服务".to_string()).clone(),
        max_users: settings.get("max_users").and_then(|v| v.parse().ok()).unwrap_or(100),
        max_api_keys: settings.get("max_api_keys").and_then(|v| v.parse().ok()).unwrap_or(1000),
        
        // 安全设置
        password_min_length: settings.get("password_min_length").and_then(|v| v.parse().ok()).unwrap_or(8),
        token_expiry_hours: settings.get("token_expiry_hours").and_then(|v| v.parse().ok()).unwrap_or(24),
        max_login_attempts: settings.get("max_login_attempts").and_then(|v| v.parse().ok()).unwrap_or(5),
        
        // 限流设置
        rate_limit_per_minute: settings.get("rate_limit_per_minute").and_then(|v| v.parse().ok()).unwrap_or(60),
        max_requests_per_day: settings.get("max_requests_per_day").and_then(|v| v.parse().ok()).unwrap_or(10000),
        
        // 缓存设置
        cache_enabled: settings.get("cache_enabled").map(|v| v == "true").unwrap_or(true),
        cache_ttl_minutes: settings.get("cache_ttl_minutes").and_then(|v| v.parse().ok()).unwrap_or(30),
        
        // 日志设置
        log_level: settings.get("log_level").unwrap_or(&"INFO".to_string()).clone(),
        log_retention_days: settings.get("log_retention_days").and_then(|v| v.parse().ok()).unwrap_or(30),
        
        // 通知设置
        email_notifications: settings.get("email_notifications").map(|v| v == "true").unwrap_or(false),
        webhook_notifications: settings.get("webhook_notifications").map(|v| v == "true").unwrap_or(false),
        alert_threshold: settings.get("alert_threshold").and_then(|v| v.parse().ok()).unwrap_or(95),
    };

    info!("✅ 获取系统设置成功");
    Ok(Json(response))
}

/// 更新系统设置
#[instrument(skip(database, settings_service, request))]
pub async fn update_settings(
    State(database): State<Database>,
    Extension(settings_service): Extension<SharedSettingsService>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<UpdateSettingsRequest>,
) -> AppResult<Json<SystemSettingsResponse>> {
    info!("⚙️ 更新系统设置请求: 用户ID {}", claims.sub);

    // 验证管理员权限（在实际部署中应该检查用户角色）
    if claims.username != "admin" {
        warn!("❌ 非管理员用户尝试修改系统设置: {}", claims.username);
        return Err(AppError::Validation("只有管理员可以修改系统设置".to_string()));
    }

    // 准备更新的设置列表
    let mut updates = Vec::new();
    
    // 基础设置
    if let Some(value) = &request.system_name {
        if !value.trim().is_empty() {
            updates.push(("system_name", value.clone()));
        }
    }
    if let Some(value) = &request.description {
        updates.push(("system_description", value.clone()));
    }
    if let Some(value) = request.max_users {
        if value > 0 {
            updates.push(("max_users", value.to_string()));
        }
    }
    if let Some(value) = request.max_api_keys {
        if value > 0 {
            updates.push(("max_api_keys", value.to_string()));
        }
    }
    
    // 安全设置
    if let Some(value) = request.password_min_length {
        if value >= 6 && value <= 32 {
            updates.push(("password_min_length", value.to_string()));
        }
    }
    if let Some(value) = request.token_expiry_hours {
        if value > 0 && value <= 168 {
            updates.push(("token_expiry_hours", value.to_string()));
        }
    }
    if let Some(value) = request.max_login_attempts {
        if value >= 3 && value <= 10 {
            updates.push(("max_login_attempts", value.to_string()));
        }
    }
    
    // 限流设置
    if let Some(value) = request.rate_limit_per_minute {
        if value > 0 {
            updates.push(("rate_limit_per_minute", value.to_string()));
        }
    }
    if let Some(value) = request.max_requests_per_day {
        if value > 0 {
            updates.push(("max_requests_per_day", value.to_string()));
        }
    }
    
    // 缓存设置
    if let Some(value) = request.cache_enabled {
        updates.push(("cache_enabled", value.to_string()));
    }
    if let Some(value) = request.cache_ttl_minutes {
        if value > 0 {
            updates.push(("cache_ttl_minutes", value.to_string()));
        }
    }
    
    // 日志设置
    if let Some(value) = &request.log_level {
        if ["DEBUG", "INFO", "WARN", "ERROR"].contains(&value.as_str()) {
            updates.push(("log_level", value.clone()));
        }
    }
    if let Some(value) = request.log_retention_days {
        if value > 0 {
            updates.push(("log_retention_days", value.to_string()));
        }
    }
    
    // 通知设置
    if let Some(value) = request.email_notifications {
        updates.push(("email_notifications", value.to_string()));
    }
    if let Some(value) = request.webhook_notifications {
        updates.push(("webhook_notifications", value.to_string()));
    }
    if let Some(value) = request.alert_threshold {
        if value >= 50 && value <= 99 {
            updates.push(("alert_threshold", value.to_string()));
        }
    }

    // 批量更新设置
    let mut tx = database.pool().begin().await.map_err(|e| AppError::Database(e))?;
    
    for (key, value) in updates {
        sqlx::query!(
            "UPDATE system_settings SET value = $1, updated_at = NOW() WHERE key = $2",
            value,
            key
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e))?;
        
        info!("🔧 更新设置: {} = {}", key, value);
    }
    
    tx.commit().await.map_err(|e| AppError::Database(e))?;

    info!("✅ 系统设置更新成功");
    
    // 通知设置服务刷新缓存
    settings_service.on_settings_updated().await?;

    // 返回更新后的设置
    get_settings(State(database), Extension(claims)).await
}

/// 获取单个设置
#[instrument(skip(database))]
pub async fn get_setting(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
    Path(key): Path<String>,
) -> AppResult<Json<SettingItem>> {
    info!("🔍 获取单个设置: {} (用户: {})", key, claims.username);

    let setting_row = sqlx::query!(
        "SELECT key, value, description, category, value_type 
         FROM system_settings 
         WHERE key = $1",
        key
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let setting = match setting_row {
        Some(row) => SettingItem {
            key: row.key,
            value: row.value,
            description: row.description,
            category: row.category,
            value_type: row.value_type,
        },
        None => {
            warn!("❌ 设置项不存在: {}", key);
            return Err(AppError::NotFound("设置项不存在".to_string()));
        }
    };

    info!("✅ 获取设置成功: {}", key);
    Ok(Json(setting))
}