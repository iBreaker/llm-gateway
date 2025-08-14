//! OAuth 核心接口定义
//! 
//! 定义通用的 OAuth 流程接口，支持多个提供商扩展

use async_trait::async_trait;
use std::collections::HashMap;

use super::types::*;

/// OAuth 提供商接口
#[async_trait]
pub trait OAuthProvider: Send + Sync {
    /// 生成授权 URL 和相关参数
    async fn generate_auth_params(&self, proxy: Option<ProxyConfig>) -> Result<OAuthParams, OAuthError>;

    /// 使用授权码交换 token
    async fn exchange_code_for_tokens(
        &self,
        authorization_code: &str,
        code_verifier: &str,
        state: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError>;

    /// 刷新 access token
    async fn refresh_access_token(
        &self,
        refresh_token: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError>;

    /// 验证 token 是否有效
    async fn validate_token(&self, access_token: &str) -> Result<bool, OAuthError>;

    /// 获取提供商名称
    fn provider_name(&self) -> &'static str;

    /// 获取支持的作用域
    fn supported_scopes(&self) -> Vec<&'static str>;

    /// 解析回调 URL 或授权码
    fn parse_callback_url(&self, input: &str) -> Result<String, OAuthError> {
        if input.trim().is_empty() {
            return Err(OAuthError::InvalidAuthCode("输入为空".to_string()));
        }

        let trimmed_input = input.trim();

        // 检查是否是 URL 格式
        if trimmed_input.starts_with("http://") || trimmed_input.starts_with("https://") {
            match url::Url::parse(trimmed_input) {
                Ok(url) => {
                    if let Some(code) = url.query_pairs().find(|(key, _)| key == "code") {
                        Ok(code.1.to_string())
                    } else {
                        Err(OAuthError::InvalidAuthCode("URL 中未找到授权码参数".to_string()))
                    }
                }
                Err(_) => Err(OAuthError::InvalidAuthCode("无效的 URL 格式".to_string())),
            }
        } else {
            // 直接的授权码，清理可能的 URL fragments
            let cleaned_code = trimmed_input.split('#').next()
                .and_then(|s| s.split('&').next())
                .unwrap_or(trimmed_input);

            if cleaned_code.len() < 10 {
                return Err(OAuthError::InvalidAuthCode("授权码长度不足".to_string()));
            }

            // 基本格式验证
            if cleaned_code.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
                Ok(cleaned_code.to_string())
            } else {
                Err(OAuthError::InvalidAuthCode("授权码包含无效字符".to_string()))
            }
        }
    }
}

/// OAuth 管理器
pub struct OAuthManager {
    providers: HashMap<OAuthProviderType, Box<dyn OAuthProvider>>,
}

impl OAuthManager {
    /// 创建新的 OAuth 管理器
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
        }
    }

    /// 注册 OAuth 提供商
    pub fn register_provider(
        &mut self,
        provider_type: OAuthProviderType,
        provider: Box<dyn OAuthProvider>,
    ) {
        self.providers.insert(provider_type, provider);
    }

    /// 获取 OAuth 提供商
    pub fn get_provider(&self, provider_type: &OAuthProviderType) -> Result<&dyn OAuthProvider, OAuthError> {
        self.providers
            .get(provider_type)
            .map(|p| p.as_ref())
            .ok_or_else(|| OAuthError::TokenExchangeFailed(format!("不支持的提供商: {:?}", provider_type)))
    }

    /// 生成授权参数
    pub async fn generate_auth_params(
        &self,
        provider_type: &OAuthProviderType,
        proxy: Option<ProxyConfig>,
    ) -> Result<OAuthParams, OAuthError> {
        let provider = self.get_provider(provider_type)?;
        provider.generate_auth_params(proxy).await
    }

    /// 交换授权码
    pub async fn exchange_code_for_tokens(
        &self,
        provider_type: &OAuthProviderType,
        authorization_code: &str,
        code_verifier: &str,
        state: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError> {
        let provider = self.get_provider(provider_type)?;
        provider.exchange_code_for_tokens(authorization_code, code_verifier, state, proxy).await
    }

    /// 刷新令牌
    pub async fn refresh_access_token(
        &self,
        provider_type: &OAuthProviderType,
        refresh_token: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError> {
        let provider = self.get_provider(provider_type)?;
        provider.refresh_access_token(refresh_token, proxy).await
    }

    /// 验证令牌
    pub async fn validate_token(
        &self,
        provider_type: &OAuthProviderType,
        access_token: &str,
    ) -> Result<bool, OAuthError> {
        let provider = self.get_provider(provider_type)?;
        provider.validate_token(access_token).await
    }
}

impl Default for OAuthManager {
    fn default() -> Self {
        Self::new()
    }
}

/// PKCE 工具函数
pub mod pkce {
    use sha2::{Digest, Sha256};
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use rand::RngCore;

    /// 生成随机的 state 参数
    pub fn generate_state() -> String {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        URL_SAFE_NO_PAD.encode(bytes)
    }

    /// 生成随机的 code verifier（PKCE）
    pub fn generate_code_verifier() -> String {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        URL_SAFE_NO_PAD.encode(bytes)
    }

    /// 生成 code challenge（PKCE）
    pub fn generate_code_challenge(code_verifier: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        let result = hasher.finalize();
        URL_SAFE_NO_PAD.encode(result)
    }
}