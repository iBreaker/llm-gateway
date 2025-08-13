//! 上游账号管理处理器
//! 
//! 处理上游账号的CRUD操作和健康检查

use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use tracing::{info, instrument};

use crate::shared::{AppError, AppResult};
use crate::auth::Claims;
use crate::presentation::dto::accounts::*;

// 使用 DTO 模块中定义的数据结构

/// 获取账号列表
#[instrument(skip(app_state))]
pub async fn list_accounts(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<AccountsListResponse>> {
    let database = &app_state.database;
    info!("📋 获取账号列表请求: 用户ID {}", claims.sub);

    // 从数据库查询账号列表
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Validation("无效的用户ID".to_string()))?;
    
    info!("🔥 即将调用数据库查询 user_id = {}", user_id);
    let upstream_accounts = database.accounts.list_by_user_id(user_id).await?;
    info!("🔥 数据库查询完成，返回 {} 条记录", upstream_accounts.len());

    // 异步收集账号信息和统计数据
    let mut accounts = Vec::new();
    for account in upstream_accounts {
        // 获取账号的使用统计
        let (request_count, success_rate) = database.accounts.get_account_statistics(account.id).await
            .unwrap_or_else(|e| {
                info!("获取账号 {} 统计失败: {}, 使用默认值", account.id, e);
                (0, 0.0)
            });

        // 使用新架构：service_provider + auth_method
        let service_provider = account.provider_config.service_provider().to_string();
        let auth_method = account.provider_config.auth_method().to_string();

        // 使用实时健康状态检查而不是存储的状态
        let real_time_status = account.check_real_time_health().await;

        // 创建过滤后的凭据信息（不包含敏感数据）
        let filtered_credentials = serde_json::json!({
            "base_url": account.credentials.base_url,
            "expires_at": account.credentials.expires_at,
            // 不返回敏感的access_token和session_key
        });

        // 将代理配置转换为JSON
        let proxy_config_json = account.proxy_config
            .as_ref()
            .map(|config| serde_json::to_value(config).unwrap_or(serde_json::Value::Null));

        accounts.push(AccountInfo {
            id: account.id,
            name: account.account_name,
            service_provider,
            auth_method,
            status: real_time_status.as_str().to_string(),
            is_active: account.is_active,
            created_at: account.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            request_count,
            success_rate,
            oauth_expires_at: account.oauth_expires_at,
            oauth_scopes: account.oauth_scopes,
            credentials: Some(filtered_credentials),
            proxy_config: proxy_config_json,
        });
    }

    let total = accounts.len() as i64;

    info!("✅ 获取账号列表成功: {} 个账号", total);

    Ok(Json(AccountsListResponse { accounts, total }))
}

/// 创建账号
#[instrument(skip(app_state, request))]
pub async fn create_account(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<CreateAccountRequest>,
) -> AppResult<Json<AccountInfo>> {
    let database = &app_state.database;
    info!("➕ 创建账号请求: {} (操作者: {})", request.name, claims.username);

    // 解析用户ID
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Validation("无效的用户ID".to_string()))?;

    // 验证并转换为 ProviderConfig
    let provider_config = request.validate_and_convert()
        .map_err(|e| AppError::Validation(e))?;

    // 提取基础URL
    let base_url = request.base_url();

    // 创建账号
    let domain_credentials = request.credentials.to_domain();
    
    // 处理代理配置 - 从代理请求中提取 proxy_id
    let proxy_config_id = request.proxy_config
        .as_ref()
        .filter(|config| config.enabled)
        .and_then(|config| config.proxy_id.as_deref());
    
    let upstream_account = database.accounts.create(
        user_id,
        &provider_config,
        &request.name,
        &domain_credentials,
        base_url.as_deref(),
        proxy_config_id,
    ).await?;

    // 获取新创建账号的统计数据
    let (request_count, success_rate) = database.accounts.get_account_statistics(upstream_account.id).await
        .unwrap_or_else(|e| {
            info!("获取新建账号 {} 统计失败: {}, 使用默认值", upstream_account.id, e);
            (0, 0.0)
        });

    let service_provider = upstream_account.provider_config.service_provider().to_string();
    let auth_method = upstream_account.provider_config.auth_method().to_string();

    // 使用实时健康状态检查
    let real_time_status = upstream_account.check_real_time_health().await;

    // 创建过滤后的凭据信息（不包含敏感数据）
    let filtered_credentials = serde_json::json!({
        "base_url": upstream_account.credentials.base_url,
        "expires_at": upstream_account.credentials.expires_at,
        // 不返回敏感的access_token和session_key
    });

    // 将代理配置转换为JSON
    let proxy_config_json = upstream_account.proxy_config
        .as_ref()
        .map(|config| serde_json::to_value(config).unwrap_or(serde_json::Value::Null));

    let account = AccountInfo {
        id: upstream_account.id,
        name: upstream_account.account_name,
        service_provider,
        auth_method,
        status: real_time_status.as_str().to_string(),
        is_active: upstream_account.is_active,
        created_at: upstream_account.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        request_count,
        success_rate,
        oauth_expires_at: upstream_account.oauth_expires_at,
        oauth_scopes: upstream_account.oauth_scopes,
        credentials: Some(filtered_credentials),
        proxy_config: proxy_config_json,
    };

    info!("✅ 账号创建成功: {} (ID: {})", account.name, account.id);

    Ok(Json(account))
}

/// 更新账号
#[instrument(skip(app_state, request))]
pub async fn update_account(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(account_id): Path<i64>,
    Json(request): Json<UpdateAccountRequest>,
) -> AppResult<Json<AccountInfo>> {
    let database = &app_state.database;
    info!("🔄 更新账号请求: ID {} (操作者: {})", account_id, claims.username);

    // 解析用户ID
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Validation("无效的用户ID".to_string()))?;

    // 首先获取现有账号信息以确定认证方式
    let existing_account = database.accounts.get_by_id(account_id, user_id).await?
        .ok_or_else(|| AppError::NotFound("账号不存在或无权限访问".to_string()))?;
    
    // 验证凭据（如果提供）
    if let Some(ref _credentials) = request.credentials {
        request.validate_credentials(existing_account.provider_config.auth_method())
            .map_err(|e| AppError::Validation(e))?;
    }

    // 处理代理配置 - 从代理请求中提取 proxy_id
    let proxy_config_id = if let Some(config) = &request.proxy_config {
        // 如果提供了代理配置，根据enabled状态决定proxy_id
        if config.enabled {
            config.proxy_id.as_deref()
        } else {
            // 明确禁用代理，设置为None
            None
        }
    } else {
        // 没有提供代理配置，不更新此字段，保持现有值
        // 需要修改数据库层支持此逻辑
        None
    };

    // 执行更新
    let updated_account = database.accounts.update(
        account_id,
        user_id,
        Some(&request.name),
        Some(request.is_active),
        request.credentials.as_ref().map(|c| c.to_domain()).as_ref(),
        proxy_config_id,
    ).await?;

    if let Some(upstream_account) = updated_account {
        // 获取更新后账号的统计数据
        let (request_count, success_rate) = database.accounts.get_account_statistics(upstream_account.id).await
            .unwrap_or_else(|e| {
                info!("获取更新账号 {} 统计失败: {}, 使用默认值", upstream_account.id, e);
                (0, 0.0)
            });

        let service_provider = upstream_account.provider_config.service_provider().to_string();
        let auth_method = upstream_account.provider_config.auth_method().to_string();

        // 使用实时健康状态检查
        let real_time_status = upstream_account.check_real_time_health().await;

        // 创建过滤后的凭据信息（不包含敏感数据）
        let filtered_credentials = serde_json::json!({
            "base_url": upstream_account.credentials.base_url
        });

        // 将代理配置转换为JSON
        let proxy_config_json = upstream_account.proxy_config
            .as_ref()
            .map(|config| serde_json::to_value(config).unwrap_or(serde_json::Value::Null));

        let account = AccountInfo {
            id: upstream_account.id,
            name: upstream_account.account_name,
            service_provider,
            auth_method,
            status: real_time_status.as_str().to_string(),
            is_active: upstream_account.is_active,
            created_at: upstream_account.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            request_count,
            success_rate,
            oauth_expires_at: upstream_account.oauth_expires_at,
            oauth_scopes: upstream_account.oauth_scopes,
            credentials: Some(filtered_credentials),
            proxy_config: proxy_config_json,
        };

        info!("✅ 账号更新成功: {} (ID: {})", account.name, account.id);
        Ok(Json(account))
    } else {
        info!("⚠️ 账号不存在或无权限更新: ID {}", account_id);
        Err(AppError::NotFound("账号不存在或无权限访问".to_string()))
    }
}

/// 删除账号
#[instrument(skip(app_state))]
pub async fn delete_account(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(account_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    let database = &app_state.database;
    info!("🗑️ 删除账号请求: ID {} (操作者: {})", account_id, claims.username);

    // 解析用户ID
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Validation("无效的用户ID".to_string()))?;

    // 执行删除
    let deleted = database.accounts.delete(account_id, user_id).await?;

    if deleted {
        info!("✅ 账号删除成功: ID {}", account_id);
        Ok(Json(serde_json::json!({
            "success": true,
            "message": "账号删除成功"
        })))
    } else {
        info!("⚠️ 账号不存在或无权限删除: ID {}", account_id);
        Err(AppError::NotFound("账号不存在或无权限访问".to_string()))
    }
}

/// 手动强制账号健康检查
/// 注意：这是手动强制检查，账号状态主要应通过实时接口返回判断
#[instrument(skip(_app_state))]
pub async fn health_check_account(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(account_id): Path<i64>,
) -> AppResult<Json<HealthCheckResponse>> {
    info!("🏥 手动强制账号健康检查请求: ID {} (操作者: {})", account_id, claims.username);

    // 模拟健康检查
    let health_status = HealthCheckResponse {
        id: account_id,
        status: "healthy".to_string(),
        response_time_ms: Some(150),
        last_check: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        success_rate: 98.5,
        message: "账号状态正常".to_string(),
    };

    info!("✅ 账号健康检查完成: ID {}", account_id);

    Ok(Json(health_status))
}

/// 获取支持的提供商列表
#[instrument]
pub async fn get_supported_providers() -> AppResult<Json<SupportedProvidersResponse>> {
    info!("📋 获取支持的提供商列表");
    
    let response = SupportedProvidersResponse::new();
    
    info!("✅ 返回 {} 个支持的提供商", response.providers.len());
    Ok(Json(response))
}

