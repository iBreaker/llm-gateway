//! OAuth处理器
//! 
//! 处理上游账号OAuth授权流程

use axum::{
    extract::{Path, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};
use std::sync::Arc;
use std::collections::HashMap;
use uuid;
use tokio::sync::Mutex;

use crate::shared::{AppError, AppResult};
use crate::auth::Claims;
use crate::auth::oauth::ProxyConfig;
use crate::auth::oauth::providers::anthropic::AnthropicOAuthProvider;
use crate::auth::oauth::types::OAuthParams;

// 简单的内存会话存储
use once_cell::sync::Lazy;
static OAUTH_SESSIONS: Lazy<Arc<Mutex<HashMap<String, OAuthParams>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(HashMap::new()))
});

/// 生成OAuth授权URL请求
#[derive(Debug, Deserialize, Default)]
pub struct GenerateAuthUrlRequest {
    /// 代理配置（可选）
    pub proxy: Option<ProxyConfig>,
}

/// 生成OAuth授权URL响应
#[derive(Debug, Serialize)]
pub struct GenerateAuthUrlResponse {
    pub auth_url: String,
    pub session_id: String,
    pub instructions: Vec<String>,
}

/// 交换OAuth授权码请求
#[derive(Debug, Deserialize)]
pub struct ExchangeCodeRequest {
    #[serde(alias = "sessionId")]
    pub session_id: String,
    #[serde(alias = "authorizationCode")]
    pub authorization_code: Option<String>,
    #[serde(alias = "callbackUrl")]
    pub callback_url: Option<String>,
}

/// 交换OAuth授权码响应
#[derive(Debug, Serialize)]
pub struct ExchangeCodeResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<i64>,
    pub scopes: Vec<String>,
}

/// Anthropic OAuth - 生成授权URL
#[instrument(skip(_app_state))]
pub async fn generate_anthropic_auth_url(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    request: Option<Json<GenerateAuthUrlRequest>>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔗 生成Anthropic OAuth授权URL请求 (操作者: {})", claims.username);

    // 处理可选的请求体，如果为空则使用默认值
    let _request = request.map(|Json(req)| req).unwrap_or_default();

    // 生成Setup Token OAuth参数（推理权限，1年有效期）- 基于relay项目建议
    let provider = AnthropicOAuthProvider::new();
    let oauth_params = provider.generate_setup_token_params();
        
    // 生成session ID并存储OAuth参数到内存中
    let session_id = uuid::Uuid::new_v4().to_string();
    
    // 存储OAuth参数到全局会话存储中
    {
        let mut sessions = OAUTH_SESSIONS.lock().await;
        sessions.insert(session_id.clone(), oauth_params.clone());
    }
    
    info!("✅ OAuth会话已创建: {}", session_id);

    // 使用AnthropicOAuthProvider生成的正确授权URL
    let auth_url = oauth_params.auth_url.clone();

    let response_data = GenerateAuthUrlResponse {
        auth_url,
        session_id,
        instructions: vec![
            "1. 复制上面的链接到浏览器中打开".to_string(),
            "2. 登录您的 Anthropic 账户".to_string(),
            "3. 同意应用权限".to_string(),
            "4. 复制页面显示的 Authorization Code".to_string(),
            "5. 在下一步中粘贴授权码".to_string(),
        ],
    };

    info!("✅ Anthropic OAuth授权URL生成成功");
    // 前端期望的响应格式：包装在data字段中
    Ok(Json(serde_json::json!({
        "data": response_data
    })))
}

/// Anthropic OAuth - 交换授权码
#[instrument(skip(app_state))]
pub async fn exchange_anthropic_code(
    State(app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Json(request): Json<ExchangeCodeRequest>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔄 交换Anthropic OAuth授权码请求 (操作者: {})", claims.username);

    // 验证请求参数
    if request.authorization_code.is_none() && request.callback_url.is_none() {
        return Err(AppError::Validation("授权码或回调URL是必需的".to_string()));
    }

    // 从内存会话存储中获取OAuth参数
    let oauth_params = {
        let mut sessions = OAUTH_SESSIONS.lock().await;
        sessions.remove(&request.session_id)
    }.ok_or_else(|| AppError::Validation("OAuth会话不存在或已过期".to_string()))?;
    
    info!("🔍 获取到会话参数: code_verifier长度={}, state={}", 
          oauth_params.code_verifier.len(), oauth_params.state);

    // 解析授权码，前端发送的callbackUrl可能是授权码或完整URL
    let auth_code = if let Some(code) = request.authorization_code {
        code
    } else if let Some(url_or_code) = request.callback_url {
        // 从回调URL中解析授权码，或直接使用授权码
        parse_auth_code_from_url(&url_or_code)?
    } else {
        return Err(AppError::Validation("必须提供授权码或回调URL".to_string()));
    };

    info!("🔍 解析得到的授权码长度: {}", auth_code.len());

    // 使用Anthropic提供商交换Setup Token，使用会话中存储的参数
    let provider = AnthropicOAuthProvider::new();
    let token_response = provider.exchange_setup_token_code(
        &auth_code,
        &oauth_params.code_verifier,
        &oauth_params.state,
        None, // TODO: 添加代理支持
    ).await.map_err(|e| AppError::Business(format!("Token交换失败: {}", e)))?;

    // 会话已经在获取时删除，无需额外操作

    // 创建上游账号记录
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::Validation("无效的用户ID".to_string()))?;

    let account_credentials = crate::business::domain::AccountCredentials {
        session_key: None,
        access_token: Some(token_response.access_token.clone()),
        refresh_token: Some(token_response.refresh_token.clone()),
        expires_at: Some(chrono::DateTime::from_timestamp(token_response.expires_at / 1000, 0)
            .unwrap_or_else(|| chrono::Utc::now())),
        base_url: None,
    };

    let account_name = format!("Anthropic OAuth - {}", chrono::Utc::now().format("%m/%d %H:%M"));
    let provider_config = crate::business::domain::ProviderConfig::new(
        crate::business::domain::ServiceProvider::Anthropic,
        crate::business::domain::AuthMethod::OAuth
    );

    let database = &app_state.database;
    let created_account = database.accounts.create(
        user_id,
        &provider_config,
        &account_name,
        &account_credentials,
        None, // base_url
    ).await?;

    info!("✅ Anthropic OAuth账号创建成功: ID {}, Name: {}", created_account.id, created_account.account_name);

    // 返回成功响应
    Ok(Json(serde_json::json!({
        "success": true,
        "account_id": created_account.id,
        "account_name": created_account.account_name,
        "message": "Anthropic OAuth账号添加成功"
    })))
}

/// 从回调URL中解析授权码
fn parse_auth_code_from_url(url: &str) -> AppResult<String> {
    // 处理直接的授权码情况
    if !url.starts_with("http") {
        // 清理可能的URL fragments
        let cleaned_code = url.split('#').next()
            .and_then(|s| s.split('&').next())
            .unwrap_or(url)
            .trim();
        
        if cleaned_code.len() < 10 {
            return Err(AppError::Validation("授权码格式无效".to_string()));
        }
        
        return Ok(cleaned_code.to_string());
    }

    // 处理完整URL情况
    let parsed_url = url::Url::parse(url)
        .map_err(|_| AppError::Validation("无效的URL格式".to_string()))?;
    
    let auth_code = parsed_url
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| AppError::Validation("回调URL中未找到授权码".to_string()))?;

    Ok(auth_code)
}

/// 刷新Anthropic OAuth Token
#[instrument(skip(_app_state))]
pub async fn refresh_anthropic_token(
    State(_app_state): State<crate::presentation::routes::AppState>,
    Extension(claims): Extension<Claims>,
    Path(account_id): Path<i64>,
) -> AppResult<Json<serde_json::Value>> {
    info!("🔄 刷新Anthropic OAuth Token: ID {} (操作者: {})", account_id, claims.username);
    
    // TODO: 实现token刷新逻辑
    // 1. 从数据库获取账号的refresh_token
    // 2. 调用Anthropic refresh token endpoint
    // 3. 更新数据库中的access_token和expires_at
    
    let response = serde_json::json!({
        "success": true,
        "message": "Token刷新功能待实现"
    });
    
    Ok(Json(response))
}