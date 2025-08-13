//! Alibaba Qwen OAuth 认证策略

use async_trait::async_trait;
use std::collections::HashMap;
use tracing::{info, error};

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::AuthStrategy;

/// Qwen OAuth 认证
pub struct QwenOAuth;

#[async_trait]
impl AuthStrategy for QwenOAuth {
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>> {
        info!("🔍 [QwenOAuth] 开始获取OAuth认证头部, 账号ID: {}", account.id);
        
        let mut headers = HashMap::new();
        
        if let Some(access_token) = &account.credentials.access_token {
            info!("🔍 [QwenOAuth] OAuth token长度: {}, 前缀: {}", 
                  access_token.len(), 
                  if access_token.len() > 10 { &access_token[..10] } else { access_token });
            
            // 检查token是否过期
            if let Some(expires_at) = account.credentials.expires_at {
                let now = chrono::Utc::now();
                if expires_at <= now {
                    error!("❌ [QwenOAuth] OAuth token已过期: expires_at={}, now={}", expires_at, now);
                    return Err(AppError::Business("Qwen OAuth access_token已过期".to_string()));
                } else {
                    info!("🔍 [QwenOAuth] OAuth token有效期: 还有{}分钟", 
                          (expires_at - now).num_minutes());
                }
            }
            
            // Qwen OAuth token 使用 Bearer 认证
            headers.insert("Authorization".to_string(), format!("Bearer {}", access_token));
            
            info!("✅ [QwenOAuth] OAuth认证头部设置完成");
            Ok(headers)
        } else {
            error!("❌ [QwenOAuth] 缺少access_token");
            Err(AppError::Business("Qwen OAuth账号缺少access_token".to_string()))
        }
    }
    
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool> {
        // 验证Qwen OAuth凭据
        if account.credentials.access_token.is_none() {
            return Ok(false);
        }
        
        // 检查是否过期
        if let Some(expires_at) = account.credentials.expires_at {
            let now = chrono::Utc::now();
            if expires_at <= now {
                return Ok(false);
            }
        }
        
        Ok(true)
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::qwen_oauth()
    }
}