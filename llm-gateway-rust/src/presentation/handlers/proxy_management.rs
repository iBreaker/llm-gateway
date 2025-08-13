//! 代理管理处理器

use axum::{response::Json, Extension, extract::{Path, State}};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, error};

use crate::shared::{AppError, AppResult};
use crate::auth::Claims;
use crate::business::domain::proxy_config::{ProxyConfig, ProxyType, ProxyAuth};
use crate::presentation::routes::AppState;

/// 系统代理配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemProxyConfig {
    pub proxies: HashMap<String, ProxyConfig>,
    pub default_proxy_id: Option<String>,
    pub global_proxy_enabled: bool,
}

/// 创建代理请求
#[derive(Debug, Deserialize)]
pub struct CreateProxyRequest {
    pub name: String,
    pub proxy_type: String, // "http", "https", "socks5"
    pub host: String,
    pub port: u16,
    pub enabled: bool,
    pub auth: Option<ProxyAuthRequest>,
}

/// 代理认证请求
#[derive(Debug, Deserialize)]
pub struct ProxyAuthRequest {
    pub username: String,
    pub password: String,
}

/// 更新代理请求
#[derive(Debug, Deserialize)]
pub struct UpdateProxyRequest {
    pub name: Option<String>,
    pub proxy_type: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub enabled: Option<bool>,
    pub auth: Option<ProxyAuthRequest>,
}

/// 设置默认代理请求
#[derive(Debug, Deserialize)]
pub struct SetDefaultProxyRequest {
    pub proxy_id: Option<String>,
}

/// 获取所有代理配置
pub async fn list_proxies(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<SystemProxyConfig>> {
    info!("🔍 获取代理配置列表");

    let database = &app_state.database;

    // 获取所有代理配置
    let proxy_rows = sqlx::query!(
        r#"
        SELECT id, name, proxy_type, host, port, enabled, auth_username, auth_password, extra_config
        FROM proxy_configs
        ORDER BY created_at DESC
        "#
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 获取系统代理全局配置
    let system_config_row = sqlx::query!(
        "SELECT default_proxy_id, global_proxy_enabled FROM system_proxy_config WHERE id = 1"
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let mut proxies = HashMap::new();

    for row in proxy_rows {
        let proxy_type = match row.proxy_type.as_str() {
            "http" => ProxyType::Http,
            "https" => ProxyType::Http, // https 类型映射到 http 代理
            "socks5" => ProxyType::Socks5,
            _ => continue, // 跳过无效类型
        };

        let auth = if let (Some(username), Some(password)) = (row.auth_username, row.auth_password) {
            Some(ProxyAuth { username, password })
        } else {
            None
        };

        let extra_config: HashMap<String, String> = row.extra_config
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();

        let proxy_config = ProxyConfig {
            id: row.id.clone(),
            name: row.name,
            proxy_type,
            host: row.host,
            port: row.port as u16,
            auth,
            enabled: row.enabled,
            extra_config,
        };

        proxies.insert(row.id, proxy_config);
    }

    let (default_proxy_id, global_proxy_enabled) = if let Some(row) = system_config_row {
        (row.default_proxy_id, row.global_proxy_enabled)
    } else {
        (None, false)
    };

    let system_config = SystemProxyConfig {
        proxies,
        default_proxy_id,
        global_proxy_enabled,
    };

    Ok(Json(system_config))
}

/// 创建代理
pub async fn create_proxy(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Json(request): Json<CreateProxyRequest>,
) -> AppResult<Json<ProxyConfig>> {
    info!("🔧 创建代理: {}", request.name);

    let database = &app_state.database;

    // 验证代理类型
    let proxy_type = match request.proxy_type.as_str() {
        "http" => ProxyType::Http,
        "https" => ProxyType::Http, // https 类型映射到 http 代理
        "socks5" => ProxyType::Socks5,
        _ => return Err(AppError::Validation("不支持的代理类型".to_string())),
    };

    let proxy_id = format!("proxy-{}", chrono::Utc::now().timestamp_millis());
    let (auth_username, auth_password) = if let Some(auth) = &request.auth {
        (Some(auth.username.clone()), Some(auth.password.clone()))
    } else {
        (None, None)
    };

    // 保存到数据库
    sqlx::query!(
        r#"
        INSERT INTO proxy_configs (id, name, proxy_type, host, port, enabled, auth_username, auth_password, extra_config)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
        proxy_id,
        request.name,
        request.proxy_type,
        request.host,
        request.port as i32,
        request.enabled,
        auth_username,
        auth_password,
        serde_json::json!({})
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 创建代理配置响应
    let proxy_config = ProxyConfig {
        id: proxy_id.clone(),
        name: request.name,
        proxy_type,
        host: request.host,
        port: request.port,
        auth: request.auth.map(|auth| ProxyAuth {
            username: auth.username,
            password: auth.password,
        }),
        enabled: request.enabled,
        extra_config: HashMap::new(),
    };

    info!("✅ 代理创建成功: {}", proxy_id);
    Ok(Json(proxy_config))
}

/// 更新代理
pub async fn update_proxy(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Path(proxy_id): Path<String>,
    Json(request): Json<UpdateProxyRequest>,
) -> AppResult<Json<ProxyConfig>> {
    info!("🔧 更新代理: {}", proxy_id);

    let database = &app_state.database;

    // 获取现有代理配置
    let existing = sqlx::query!(
        "SELECT id, name, proxy_type, host, port, enabled, auth_username, auth_password, extra_config FROM proxy_configs WHERE id = $1",
        proxy_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let existing = existing.ok_or_else(|| AppError::Validation("代理配置不存在".to_string()))?;

    // 准备更新的字段
    let new_name = request.name.unwrap_or(existing.name);
    let new_proxy_type = if let Some(proxy_type_str) = request.proxy_type {
        match proxy_type_str.as_str() {
            "http" | "https" | "socks5" => proxy_type_str,
            _ => return Err(AppError::Validation("不支持的代理类型".to_string())),
        }
    } else {
        existing.proxy_type
    };
    let new_host = request.host.unwrap_or(existing.host);
    let new_port = request.port.map(|p| p as i32).unwrap_or(existing.port);
    let new_enabled = request.enabled.unwrap_or(existing.enabled);
    
    let (new_auth_username, new_auth_password) = if let Some(auth) = request.auth {
        (Some(auth.username), Some(auth.password))
    } else {
        (existing.auth_username, existing.auth_password)
    };

    // 更新数据库
    sqlx::query!(
        r#"
        UPDATE proxy_configs 
        SET name = $2, proxy_type = $3, host = $4, port = $5, enabled = $6, 
            auth_username = $7, auth_password = $8, updated_at = NOW()
        WHERE id = $1
        "#,
        proxy_id,
        new_name,
        new_proxy_type,
        new_host,
        new_port,
        new_enabled,
        new_auth_username,
        new_auth_password
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    // 构造响应
    let proxy_type_enum = match new_proxy_type.as_str() {
        "http" => ProxyType::Http,
        "https" => ProxyType::Http, // https 类型映射到 http 代理
        "socks5" => ProxyType::Socks5,
        _ => ProxyType::Http, // 不应该到达这里
    };

    let auth = if let (Some(username), Some(password)) = (new_auth_username, new_auth_password) {
        Some(ProxyAuth { username, password })
    } else {
        None
    };

    let proxy_config = ProxyConfig {
        id: proxy_id.clone(),
        name: new_name,
        proxy_type: proxy_type_enum,
        host: new_host,
        port: new_port as u16,
        auth,
        enabled: new_enabled,
        extra_config: HashMap::new(),
    };

    info!("✅ 代理更新成功: {}", proxy_id);
    Ok(Json(proxy_config))
}

/// 删除代理
pub async fn delete_proxy(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Path(proxy_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🗑️ 删除代理: {}", proxy_id);

    let database = &app_state.database;

    // 检查代理是否存在
    let exists = sqlx::query!("SELECT id FROM proxy_configs WHERE id = $1", proxy_id)
        .fetch_optional(database.pool())
        .await
        .map_err(|e| AppError::Database(e))?;

    if exists.is_none() {
        return Err(AppError::Validation("代理配置不存在".to_string()));
    }

    // 删除代理配置
    sqlx::query!("DELETE FROM proxy_configs WHERE id = $1", proxy_id)
        .execute(database.pool())
        .await
        .map_err(|e| AppError::Database(e))?;

    // 如果这是默认代理，清除默认代理设置
    sqlx::query!(
        "UPDATE system_proxy_config SET default_proxy_id = NULL WHERE default_proxy_id = $1",
        proxy_id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    info!("✅ 代理删除成功: {}", proxy_id);
    Ok(Json(serde_json::json!({
        "success": true,
        "message": "代理删除成功"
    })))
}

/// 设置默认代理
pub async fn set_default_proxy(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Json(request): Json<SetDefaultProxyRequest>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔧 设置默认代理: {:?}", request.proxy_id);

    let database = &app_state.database;

    // 如果指定了代理ID，验证代理存在
    if let Some(proxy_id) = &request.proxy_id {
        let exists = sqlx::query!("SELECT id FROM proxy_configs WHERE id = $1", proxy_id)
            .fetch_optional(database.pool())
            .await
            .map_err(|e| AppError::Database(e))?;

        if exists.is_none() {
            return Err(AppError::Validation("指定的代理配置不存在".to_string()));
        }
    }

    // 更新默认代理设置
    sqlx::query!(
        "UPDATE system_proxy_config SET default_proxy_id = $1 WHERE id = 1",
        request.proxy_id
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "默认代理设置成功"
    })))
}

/// 切换全局代理状态
pub async fn toggle_global_proxy(
    State(app_state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Json(enabled): Json<bool>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔧 切换全局代理状态: {}", enabled);

    let database = &app_state.database;

    // 更新全局代理状态
    sqlx::query!(
        "UPDATE system_proxy_config SET global_proxy_enabled = $1 WHERE id = 1",
        enabled
    )
    .execute(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "global_proxy_enabled": enabled,
        "message": "全局代理状态更新成功"
    })))
}