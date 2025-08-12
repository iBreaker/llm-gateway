//! OAuth 管理器实现
//! 
//! 提供统一的 OAuth 管理接口，包括会话管理和提供商管理

use std::sync::Arc;
use chrono::{DateTime, Utc};
use tracing::{info, error};

use crate::infrastructure::cache::CacheManager;
use super::{
    core::{OAuthManager as CoreOAuthManager},
    session::OAuthSessionManager,
    providers::AnthropicOAuthProvider,
    types::*,
};

/// 完整的 OAuth 管理器
pub struct OAuthManager {
    core_manager: CoreOAuthManager,
    session_manager: OAuthSessionManager,
}

impl OAuthManager {
    /// 创建新的 OAuth 管理器
    pub fn new(cache: Arc<CacheManager>) -> Self {
        let mut core_manager = CoreOAuthManager::new();
        
        // 注册 Anthropic OAuth 提供商
        core_manager.register_provider(
            OAuthProviderType::Anthropic,
            Box::new(AnthropicOAuthProvider::new()),
        );
        
        // TODO: 注册其他提供商
        // core_manager.register_provider(OAuthProviderType::Gemini, ...);
        // core_manager.register_provider(OAuthProviderType::Qwen, ...);

        let session_manager = OAuthSessionManager::new(cache);

        Self {
            core_manager,
            session_manager,
        }
    }

    /// 开始 OAuth 流程 - 生成授权 URL 和会话
    pub async fn start_oauth_flow(
        &self,
        provider: OAuthProviderType,
        session_type: &str, // "oauth" or "setup-token"
        proxy: Option<ProxyConfig>,
    ) -> Result<(String, OAuthParams), OAuthError> {
        info!("🚀 开始 {:?} OAuth 流程，类型: {}", provider, session_type);

        // 生成授权参数
        let oauth_params = match (provider, session_type) {
            (OAuthProviderType::Anthropic, "setup-token") => {
                // 特殊处理 Anthropic Setup Token
                let anthropic_provider = AnthropicOAuthProvider::new();
                anthropic_provider.generate_setup_token_params()
            }
            _ => {
                // 标准 OAuth 流程
                self.core_manager.generate_auth_params(&provider, proxy.clone()).await?
            }
        };

        // 创建会话
        let session_id = self.session_manager.create_session(
            oauth_params.clone(),
            session_type,
            proxy,
        ).await?;

        Ok((session_id, oauth_params))
    }

    /// 完成 OAuth 流程 - 交换授权码
    pub async fn complete_oauth_flow(
        &self,
        session_id: &str,
        authorization_code: &str,
    ) -> Result<TokenResponse, OAuthError> {
        info!("🔄 完成 OAuth 流程，会话ID: {}", session_id);

        // 获取会话信息
        let session = self.session_manager.get_session(session_id).await?;

        // 解析授权码
        let provider_type = match session.session_type.as_str() {
            "setup-token" => OAuthProviderType::Anthropic, // 目前只有 Anthropic 支持
            _ => OAuthProviderType::Anthropic, // 默认为 Anthropic，后续可扩展
        };

        let provider = self.core_manager.get_provider(&provider_type)?;
        let cleaned_code = provider.parse_callback_url(authorization_code)?;

        // 交换 token
        let token_response = if session.session_type == "setup-token" {
            // 特殊处理 Setup Token
            let anthropic_provider = AnthropicOAuthProvider::new();
            anthropic_provider.exchange_setup_token_code(
                &cleaned_code,
                &session.code_verifier,
                &session.state,
                session.proxy,
            ).await?
        } else {
            // 标准 OAuth 流程
            self.core_manager.exchange_code_for_tokens(
                &provider_type,
                &cleaned_code,
                &session.code_verifier,
                &session.state,
                session.proxy,
            ).await?
        };

        // 删除已使用的会话
        self.session_manager.delete_session(session_id).await.ok();

        info!("✅ OAuth 流程完成");
        Ok(token_response)
    }

    /// 刷新访问令牌
    pub async fn refresh_token(
        &self,
        provider: OAuthProviderType,
        refresh_token: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError> {
        info!("🔄 刷新 {:?} 访问令牌", provider);

        self.core_manager.refresh_access_token(
            &provider,
            refresh_token,
            proxy,
        ).await
    }

    /// 验证访问令牌
    pub async fn validate_token(
        &self,
        provider: OAuthProviderType,
        access_token: &str,
    ) -> Result<bool, OAuthError> {
        self.core_manager.validate_token(&provider, access_token).await
    }

    /// 获取会话信息（用于调试）
    pub async fn get_session(&self, session_id: &str) -> Result<OAuthSession, OAuthError> {
        self.session_manager.get_session(session_id).await
    }

    /// 清理过期会话
    pub async fn cleanup_expired_sessions(&self) -> Result<usize, OAuthError> {
        self.session_manager.cleanup_expired_sessions().await
    }

    /// 检查 token 是否需要刷新
    pub fn token_needs_refresh(&self, expires_at: i64) -> bool {
        let now = Utc::now().timestamp_millis();
        let refresh_threshold = 10 * 60 * 1000; // 10分钟
        (expires_at - now) < refresh_threshold
    }

    /// 检查 token 是否已过期
    pub fn token_is_expired(&self, expires_at: i64) -> bool {
        let now = Utc::now().timestamp_millis();
        now >= expires_at
    }

    /// 格式化为 claudeAiOauth 格式（兼容 claude-relay-service）
    pub fn format_claude_credentials(&self, token_response: &TokenResponse) -> serde_json::Value {
        serde_json::json!({
            "claudeAiOauth": {
                "accessToken": token_response.access_token,
                "refreshToken": token_response.refresh_token,
                "expiresAt": token_response.expires_at,
                "scopes": token_response.scopes,
                "isMax": token_response.is_max
            }
        })
    }
}