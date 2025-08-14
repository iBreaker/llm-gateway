//! Anthropic OAuth 提供商实现
//! 
//! 基于 claude-relay-service 的成功实现

use async_trait::async_trait;
use reqwest::{Client, Proxy};
use serde_json::{json, Value};
use tracing::{info, error};
use url::Url;

use crate::auth::oauth::{
    core::{OAuthProvider, pkce},
    types::*,
};

/// Anthropic OAuth 配置常量
pub struct AnthropicConfig;

impl AnthropicConfig {
    pub const AUTHORIZE_URL: &'static str = "https://claude.ai/oauth/authorize";
    pub const TOKEN_URL: &'static str = "https://console.anthropic.com/v1/oauth/token";
    pub const CLIENT_ID: &'static str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
    pub const REDIRECT_URI: &'static str = "https://console.anthropic.com/oauth/code/callback";
    pub const SCOPES: &'static str = "org:create_api_key user:profile user:inference";
    pub const SCOPES_SETUP: &'static str = "user:inference";
}

/// Anthropic OAuth 提供商
pub struct AnthropicOAuthProvider {
    client: Client,
}

impl AnthropicOAuthProvider {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("claude-cli/1.0.56 (external, cli)")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }

    /// 创建带代理的客户端
    fn create_client_with_proxy(&self, proxy_config: &ProxyConfig) -> Result<Client, OAuthError> {
        let proxy_url = match proxy_config.r#type.as_str() {
            "http" | "https" => {
                if let (Some(username), Some(password)) = (&proxy_config.username, &proxy_config.password) {
                    format!("{}://{}:{}@{}:{}", 
                        proxy_config.r#type, username, password, 
                        proxy_config.host, proxy_config.port)
                } else {
                    format!("{}://{}:{}", 
                        proxy_config.r#type, proxy_config.host, proxy_config.port)
                }
            }
            "socks5" => {
                if let (Some(username), Some(password)) = (&proxy_config.username, &proxy_config.password) {
                    format!("socks5://{}:{}@{}:{}", 
                        username, password, proxy_config.host, proxy_config.port)
                } else {
                    format!("socks5://{}:{}", proxy_config.host, proxy_config.port)
                }
            }
            _ => return Err(OAuthError::TokenExchangeFailed(
                "不支持的代理类型".to_string()
            )),
        };

        let proxy = Proxy::all(&proxy_url)
            .map_err(|e| OAuthError::NetworkError(e))?;

        let client = Client::builder()
            .user_agent("claude-cli/1.0.56 (external, cli)")
            .timeout(std::time::Duration::from_secs(30))
            .proxy(proxy)
            .build()
            .map_err(|e| OAuthError::NetworkError(e))?;

        Ok(client)
    }

    /// 生成授权 URL
    fn generate_auth_url(&self, code_challenge: &str, state: &str) -> String {
        let mut url = Url::parse(AnthropicConfig::AUTHORIZE_URL)
            .expect("Invalid authorize URL");

        url.query_pairs_mut()
            .append_pair("code", "true")
            .append_pair("client_id", AnthropicConfig::CLIENT_ID)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", AnthropicConfig::REDIRECT_URI)
            .append_pair("scope", AnthropicConfig::SCOPES)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", state);

        url.to_string()
    }

    /// 生成 Setup Token 授权 URL
    fn generate_setup_token_auth_url(&self, code_challenge: &str, state: &str) -> String {
        let mut url = Url::parse(AnthropicConfig::AUTHORIZE_URL)
            .expect("Invalid authorize URL");

        url.query_pairs_mut()
            .append_pair("code", "true")
            .append_pair("client_id", AnthropicConfig::CLIENT_ID)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", AnthropicConfig::REDIRECT_URI)
            .append_pair("scope", AnthropicConfig::SCOPES_SETUP)
            .append_pair("code_challenge", code_challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", state);

        url.to_string()
    }

    /// 使用授权码交换 Setup Token
    pub async fn exchange_setup_token_code(
        &self,
        authorization_code: &str,
        code_verifier: &str,
        state: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError> {
        let client = if let Some(proxy_config) = &proxy {
            self.create_client_with_proxy(proxy_config)?
        } else {
            self.client.clone()
        };

        let cleaned_code = authorization_code.split('#').next()
            .and_then(|s| s.split('&').next())
            .unwrap_or(authorization_code);

        let params = json!({
            "grant_type": "authorization_code",
            "client_id": AnthropicConfig::CLIENT_ID,
            "code": cleaned_code,
            "redirect_uri": AnthropicConfig::REDIRECT_URI,
            "code_verifier": code_verifier,
            "state": state,
            "expires_in": 31536000
        });

        info!("🔄 正在进行 Setup Token 交换...");

        let response = client
            .post(AnthropicConfig::TOKEN_URL)
            .header("Content-Type", "application/json")
            .header("User-Agent", "claude-cli/1.0.56 (external, cli)")
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", "https://claude.ai/")
            .header("Origin", "https://claude.ai")
            .json(&params)
            .send()
            .await
            .map_err(|e| OAuthError::NetworkError(e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            error!("❌ Setup Token 交换失败: HTTP {}, {}", status, error_text);
            return Err(OAuthError::TokenExchangeFailed(
                format!("HTTP {}: {}", status, error_text)
            ));
        }

        let data: Value = response.json().await
            .map_err(|e| OAuthError::NetworkError(e))?;

        info!("✅ Setup Token 交换成功");

        let access_token = data["access_token"].as_str()
            .ok_or_else(|| OAuthError::TokenExchangeFailed("响应中缺少 access_token".to_string()))?;

        let expires_in = data["expires_in"].as_i64().unwrap_or(31536000);
        let expires_at = chrono::Utc::now().timestamp_millis() + (expires_in * 1000);

        let scopes = if let Some(scope_str) = data["scope"].as_str() {
            scope_str.split(' ').map(|s| s.to_string()).collect()
        } else {
            vec!["user:inference".to_string(), "user:profile".to_string()]
        };

        Ok(TokenResponse {
            access_token: access_token.to_string(),
            refresh_token: String::new(), // Setup token 通常没有 refresh token
            expires_at,
            scopes,
            is_max: true,
        })
    }

    /// 生成 Setup Token 参数
    pub fn generate_setup_token_params(&self) -> OAuthParams {
        let state = pkce::generate_state();
        let code_verifier = pkce::generate_code_verifier();
        let code_challenge = pkce::generate_code_challenge(&code_verifier);
        let auth_url = self.generate_setup_token_auth_url(&code_challenge, &state);

        OAuthParams {
            auth_url,
            code_verifier,
            state,
            code_challenge,
        }
    }
}

#[async_trait]
impl OAuthProvider for AnthropicOAuthProvider {
    async fn generate_auth_params(&self, _proxy: Option<ProxyConfig>) -> Result<OAuthParams, OAuthError> {
        let state = pkce::generate_state();
        let code_verifier = pkce::generate_code_verifier();
        let code_challenge = pkce::generate_code_challenge(&code_verifier);
        let auth_url = self.generate_auth_url(&code_challenge, &state);

        Ok(OAuthParams {
            auth_url,
            code_verifier,
            state,
            code_challenge,
        })
    }

    async fn exchange_code_for_tokens(
        &self,
        authorization_code: &str,
        code_verifier: &str,
        state: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError> {
        let client = if let Some(proxy_config) = &proxy {
            self.create_client_with_proxy(proxy_config)?
        } else {
            self.client.clone()
        };

        let cleaned_code = authorization_code.split('#').next()
            .and_then(|s| s.split('&').next())
            .unwrap_or(authorization_code);

        let params = json!({
            "grant_type": "authorization_code",
            "client_id": AnthropicConfig::CLIENT_ID,
            "code": cleaned_code,
            "redirect_uri": AnthropicConfig::REDIRECT_URI,
            "code_verifier": code_verifier,
            "state": state
        });

        info!("🔄 正在进行 OAuth token 交换...");

        let response = client
            .post(AnthropicConfig::TOKEN_URL)
            .header("Content-Type", "application/json")
            .header("User-Agent", "claude-cli/1.0.56 (external, cli)")
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", "https://claude.ai/")
            .header("Origin", "https://claude.ai")
            .json(&params)
            .send()
            .await
            .map_err(|e| OAuthError::NetworkError(e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            error!("❌ OAuth token 交换失败: HTTP {}, {}", status, error_text);
            return Err(OAuthError::TokenExchangeFailed(
                format!("HTTP {}: {}", status, error_text)
            ));
        }

        let data: Value = response.json().await
            .map_err(|e| OAuthError::NetworkError(e))?;

        info!("✅ OAuth token 交换成功");

        let access_token = data["access_token"].as_str()
            .ok_or_else(|| OAuthError::TokenExchangeFailed("响应中缺少 access_token".to_string()))?;

        let refresh_token = data["refresh_token"].as_str().unwrap_or("").to_string();
        
        let expires_in = data["expires_in"].as_i64().unwrap_or(3600);
        let expires_at = chrono::Utc::now().timestamp_millis() + (expires_in * 1000);

        let scopes = if let Some(scope_str) = data["scope"].as_str() {
            scope_str.split(' ').map(|s| s.to_string()).collect()
        } else {
            vec!["user:inference".to_string(), "user:profile".to_string()]
        };

        Ok(TokenResponse {
            access_token: access_token.to_string(),
            refresh_token,
            expires_at,
            scopes,
            is_max: true,
        })
    }

    async fn refresh_access_token(
        &self,
        refresh_token: &str,
        proxy: Option<ProxyConfig>,
    ) -> Result<TokenResponse, OAuthError> {
        let client = if let Some(proxy_config) = &proxy {
            self.create_client_with_proxy(proxy_config)?
        } else {
            self.client.clone()
        };

        let params = json!({
            "grant_type": "refresh_token",
            "client_id": AnthropicConfig::CLIENT_ID,
            "refresh_token": refresh_token
        });

        info!("🔄 正在刷新 OAuth token...");

        let response = client
            .post(AnthropicConfig::TOKEN_URL)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/plain, */*")
            .header("Accept-Language", "en-US,en;q=0.9")
            .header("Referer", "https://claude.ai/")
            .header("Origin", "https://claude.ai")
            .json(&params)
            .send()
            .await
            .map_err(|e| OAuthError::NetworkError(e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            error!("❌ OAuth token 刷新失败: HTTP {}, {}", status, error_text);
            return Err(OAuthError::TokenRefreshFailed(
                format!("HTTP {}: {}", status, error_text)
            ));
        }

        let data: Value = response.json().await
            .map_err(|e| OAuthError::NetworkError(e))?;

        info!("✅ OAuth token 刷新成功");

        let access_token = data["access_token"].as_str()
            .ok_or_else(|| OAuthError::TokenRefreshFailed("响应中缺少 access_token".to_string()))?;

        let new_refresh_token = data["refresh_token"].as_str().unwrap_or(refresh_token);
        
        let expires_in = data["expires_in"].as_i64().unwrap_or(3600);
        let expires_at = chrono::Utc::now().timestamp_millis() + (expires_in * 1000);

        let scopes = if let Some(scope_str) = data["scope"].as_str() {
            scope_str.split(' ').map(|s| s.to_string()).collect()
        } else {
            vec!["user:inference".to_string(), "user:profile".to_string()]
        };

        Ok(TokenResponse {
            access_token: access_token.to_string(),
            refresh_token: new_refresh_token.to_string(),
            expires_at,
            scopes,
            is_max: true,
        })
    }

    async fn validate_token(&self, access_token: &str) -> Result<bool, OAuthError> {
        // 简化的 token 验证：检查格式和长度
        // 在实际生产环境中，可以调用 Anthropic API 来验证 token
        Ok(!access_token.is_empty() && access_token.len() > 20)
    }

    fn provider_name(&self) -> &'static str {
        "Anthropic"
    }

    fn supported_scopes(&self) -> Vec<&'static str> {
        vec![
            "org:create_api_key",
            "user:profile", 
            "user:inference"
        ]
    }
}

impl Default for AnthropicOAuthProvider {
    fn default() -> Self {
        Self::new()
    }
}