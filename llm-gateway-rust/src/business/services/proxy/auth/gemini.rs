//! Google Gemini API Key 认证策略

use async_trait::async_trait;
use std::collections::HashMap;
use tracing::{info, error};

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::AuthStrategy;

/// Google Gemini API Key 认证
pub struct GeminiAuth;

/// Google Gemini OAuth 认证
pub struct GeminiOAuth;

#[async_trait]
impl AuthStrategy for GeminiAuth {
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>> {
        info!("🔍 [GeminiAuth] 开始获取认证头部, 账号ID: {}", account.id);
        
        let mut headers = HashMap::new();
        
        // Gemini可能使用session_key或access_token作为API Key
        let api_key = account.credentials.session_key.as_ref()
            .or(account.credentials.access_token.as_ref());
        
        if let Some(key) = api_key {
            info!("🔍 [GeminiAuth] API密钥长度: {}, 前缀: {}", 
                  key.len(), 
                  if key.len() > 10 { &key[..10] } else { key });
            
            // Gemini 可能使用查询参数传递API Key，这里先用Header方式
            // TODO: 根据实际Gemini API文档调整
            headers.insert("Authorization".to_string(), format!("Bearer {}", key));
            
            info!("✅ [GeminiAuth] 认证头部设置完成");
            Ok(headers)
        } else {
            error!("❌ [GeminiAuth] 缺少认证信息");
            Err(AppError::Business("Gemini账号缺少认证信息".to_string()))
        }
    }
    
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool> {
        // 简单验证：检查是否有session_key或access_token
        let has_credentials = account.credentials.session_key.is_some() 
            || account.credentials.access_token.is_some();
        Ok(has_credentials)
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::gemini_api()
    }
}

#[async_trait]
impl AuthStrategy for GeminiOAuth {
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>> {
        info!("🔍 [GeminiOAuth] 开始获取OAuth认证头部, 账号ID: {}", account.id);
        
        let mut headers = HashMap::new();
        
        if let Some(access_token) = &account.credentials.access_token {
            info!("🔍 [GeminiOAuth] OAuth token长度: {}, 前缀: {}", 
                  access_token.len(), 
                  if access_token.len() > 10 { &access_token[..10] } else { access_token });
            
            // 检查token是否过期
            if let Some(expires_at) = account.credentials.expires_at {
                let now = chrono::Utc::now();
                if expires_at <= now {
                    error!("❌ [GeminiOAuth] OAuth token已过期: expires_at={}, now={}", expires_at, now);
                    return Err(AppError::Business("Gemini OAuth access_token已过期".to_string()));
                } else {
                    info!("🔍 [GeminiOAuth] OAuth token有效期: 还有{}分钟", 
                          (expires_at - now).num_minutes());
                }
            }
            
            // Gemini OAuth token 使用 Bearer 认证
            headers.insert("Authorization".to_string(), format!("Bearer {}", access_token));
            
            info!("✅ [GeminiOAuth] OAuth认证头部设置完成");
            Ok(headers)
        } else {
            error!("❌ [GeminiOAuth] 缺少access_token");
            Err(AppError::Business("Gemini OAuth账号缺少access_token".to_string()))
        }
    }
    
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool> {
        // 验证Gemini OAuth凭据
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
        ProviderConfig::gemini_oauth()
    }
}