//! Anthropic OAuth 认证策略

use async_trait::async_trait;
use std::collections::HashMap;
use tracing::{info, error};

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::AuthStrategy;

/// Anthropic OAuth 认证
pub struct AnthropicOauthAuth;

#[async_trait]
impl AuthStrategy for AnthropicOauthAuth {
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>> {
        info!("🔍 [AnthropicOauthAuth] 开始获取OAuth认证头部, 账号ID: {}", account.id);
        
        let mut headers = HashMap::new();
        
        // AnthropicOauth类型：专门使用OAuth access_token
        if let Some(access_token) = &account.credentials.access_token {
            info!("🔍 [AnthropicOauthAuth] OAuth token长度: {}, 前缀: {}", 
                  access_token.len(), 
                  if access_token.len() > 10 { &access_token[..10] } else { access_token });
            
            // 检查token是否过期
            if let Some(expires_at) = account.credentials.expires_at {
                let now = chrono::Utc::now();
                if expires_at <= now {
                    error!("❌ [AnthropicOauthAuth] OAuth token已过期: expires_at={}, now={}", expires_at, now);
                    return Err(AppError::Business("OAuth access_token已过期".to_string()));
                } else {
                    info!("🔍 [AnthropicOauthAuth] OAuth token有效期: 还有{}分钟", 
                          (expires_at - now).num_minutes());
                }
            } else {
                info!("🔍 [AnthropicOauthAuth] OAuth token没有设置过期时间");
            }
            
            // OAuth token 总是使用 Bearer 认证（OAuth标准）
            info!("🔍 [AnthropicOauthAuth] OAuth token 使用 Authorization Bearer 认证（OAuth标准）");
            headers.insert("Authorization".to_string(), format!("Bearer {}", access_token));
            
            // OAuth请求必须包含oauth-2025-04-20 beta标志
            info!("🔍 [AnthropicOauthAuth] OAuth请求添加oauth-2025-04-20 beta标志");
            headers.insert(
                "anthropic-beta".to_string(),
                "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14".to_string()
            );
            
            info!("✅ [AnthropicOauthAuth] OAuth认证头部设置完成");
            Ok(headers)
        } else {
            error!("❌ [AnthropicOauthAuth] 缺少access_token");
            Err(AppError::Business("Anthropic OAuth账号缺少access_token".to_string()))
        }
    }
    
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool> {
        // 验证OAuth凭据：需要access_token，可选expires_at检查
        if account.credentials.access_token.is_none() {
            return Ok(false);
        }
        
        // 如果有过期时间，检查是否过期
        if let Some(expires_at) = account.credentials.expires_at {
            let now = chrono::Utc::now();
            if expires_at <= now {
                return Ok(false);
            }
        }
        
        Ok(true)
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::anthropic_oauth()
    }
}