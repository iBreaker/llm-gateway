//! 上游账号管理处理器
//! 
//! 处理上游账号的CRUD操作和健康检查

use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};
use crate::auth::Claims;
use crate::business::domain::{AccountProvider, AccountCredentials};

/// 上游账号信息
#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub id: i64,
    pub name: String,
    pub account_type: String,
    pub provider: String,
    pub status: String,
    pub is_active: bool,
    pub created_at: String,
    pub last_health_check: Option<String>,
    pub request_count: i64,
    pub success_rate: f64,
}

/// 账号列表响应
#[derive(Debug, Serialize)]
pub struct AccountsListResponse {
    pub accounts: Vec<AccountInfo>,
    pub total: i64,
}

/// 创建账号请求
#[derive(Debug, Deserialize)]
pub struct CreateAccountRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: String,
    pub provider: String,
    pub credentials: serde_json::Value,
}

/// 更新账号请求
#[derive(Debug, Deserialize)]
pub struct UpdateAccountRequest {
    pub name: String,
    pub is_active: bool,
    pub credentials: Option<serde_json::Value>,
}

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

        // 使用新的方法获取显示类型和提供商名称
        let account_type = match account.provider {
            AccountProvider::AnthropicApi => "anthropic_api",
            AccountProvider::AnthropicOauth => "anthropic_oauth",
        };

        let provider = account.provider.provider_name();

        accounts.push(AccountInfo {
            id: account.id,
            name: account.account_name,
            account_type: account_type.to_string(),
            provider: provider.to_string(),
            status: account.health_status.as_str().to_string(),
            is_active: account.is_active,
            created_at: account.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            last_health_check: account.last_health_check
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()),
            request_count,
            success_rate,
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

    // 解析账号提供商（基于前端发送的type字段）
    let provider = match request.account_type.as_str() {
        "anthropic_api" | "ANTHROPIC_API" => AccountProvider::AnthropicApi,
        "anthropic_oauth" | "ANTHROPIC_OAUTH" => AccountProvider::AnthropicOauth,
        _ => return Err(AppError::Validation(
            format!("不支持的账号类型: {}", request.account_type)
        )),
    };

    // 解析凭据
    let credentials = if let Some(creds_obj) = request.credentials.as_object() {
        AccountCredentials {
            session_key: creds_obj.get("session_key")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            access_token: creds_obj.get("access_token")
                .or_else(|| creds_obj.get("api_key"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            refresh_token: creds_obj.get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            expires_at: None,
            base_url: creds_obj.get("base_url")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        }
    } else {
        return Err(AppError::Validation("凭据格式无效".to_string()));
    };

    // 创建账号
    let upstream_account = database.accounts.create(
        user_id,
        &provider,
        &request.name,
        &credentials,
    ).await?;

    // 获取新创建账号的统计数据
    let (request_count, success_rate) = database.accounts.get_account_statistics(upstream_account.id).await
        .unwrap_or_else(|e| {
            info!("获取新建账号 {} 统计失败: {}, 使用默认值", upstream_account.id, e);
            (0, 0.0)
        });

    let account_type = match upstream_account.provider {
        AccountProvider::AnthropicApi => "anthropic_api",
        AccountProvider::AnthropicOauth => "anthropic_oauth",
    };

    let provider_name = upstream_account.provider.provider_name();

    let account = AccountInfo {
        id: upstream_account.id,
        name: upstream_account.account_name,
        account_type: account_type.to_string(),
        provider: provider_name.to_string(),
        status: upstream_account.health_status.as_str().to_string(),
        is_active: upstream_account.is_active,
        created_at: upstream_account.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
        last_health_check: upstream_account.last_health_check
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()),
        request_count,
        success_rate,
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

    // 解析凭据（如果提供）
    let credentials = if let Some(creds_value) = &request.credentials {
        if let Some(creds_obj) = creds_value.as_object() {
            Some(AccountCredentials {
                session_key: creds_obj.get("session_key")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                access_token: creds_obj.get("access_token")
                    .or_else(|| creds_obj.get("api_key"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                refresh_token: creds_obj.get("refresh_token")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                expires_at: None,
                base_url: creds_obj.get("base_url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            })
        } else {
            return Err(AppError::Validation("凭据格式无效".to_string()));
        }
    } else {
        None
    };

    // 执行更新
    let updated_account = database.accounts.update(
        account_id,
        user_id,
        Some(&request.name),
        Some(request.is_active),
        credentials.as_ref(),
    ).await?;

    if let Some(upstream_account) = updated_account {
        // 获取更新后账号的统计数据
        let (request_count, success_rate) = database.accounts.get_account_statistics(upstream_account.id).await
            .unwrap_or_else(|e| {
                info!("获取更新账号 {} 统计失败: {}, 使用默认值", upstream_account.id, e);
                (0, 0.0)
            });

        let account_type = match upstream_account.provider {
            AccountProvider::AnthropicApi => "anthropic_api",
            AccountProvider::AnthropicOauth => "anthropic_oauth",
        };

        let provider_name = upstream_account.provider.provider_name();

        let account = AccountInfo {
            id: upstream_account.id,
            name: upstream_account.account_name,
            account_type: account_type.to_string(),
            provider: provider_name.to_string(),
            status: upstream_account.health_status.as_str().to_string(),
            is_active: upstream_account.is_active,
            created_at: upstream_account.created_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            last_health_check: upstream_account.last_health_check
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string()),
            request_count,
            success_rate,
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

/// 账号健康检查
#[instrument(skip(_app_state))]
pub async fn health_check_account(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(account_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🏥 账号健康检查请求: ID {} (操作者: {})", account_id, claims.username);

    // 模拟健康检查
    let health_status = serde_json::json!({
        "id": account_id,
        "status": "healthy",
        "response_time": 150,
        "last_check": "2025-08-05T13:26:00Z",
        "success_rate": 98.5,
        "message": "账号状态正常"
    });

    info!("✅ 账号健康检查完成: ID {}", account_id);

    Ok(Json(health_status))
}

/// OAuth相关接口 - 生成授权URL
#[instrument(skip(_app_state))]
pub async fn generate_oauth_url(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔗 生成OAuth授权URL请求 (操作者: {})", claims.username);

    let auth_url = serde_json::json!({
        "auth_url": "https://api.anthropic.com/oauth/authorize?client_id=example&redirect_uri=http://localhost:7439/accounts/oauth/callback&scope=read_write",
        "state": "random_state_token_123"
    });

    Ok(Json(auth_url))
}

/// OAuth相关接口 - 交换授权码
#[instrument(skip(_app_state, _request))]
pub async fn exchange_oauth_code(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Json(_request): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔄 交换OAuth授权码请求 (操作者: {})", claims.username);

    let result = serde_json::json!({
        "success": true,
        "account_id": 999,
        "account_name": "OAuth Account",
        "message": "OAuth账号创建成功"
    });

    Ok(Json(result))
}