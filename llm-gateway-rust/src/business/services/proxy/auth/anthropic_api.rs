//! Anthropic API Key 认证策略

use async_trait::async_trait;
use std::collections::HashMap;
use tracing::{info, error};

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::AuthStrategy;

/// Anthropic API Key 认证
pub struct AnthropicApiAuth;

#[async_trait]
impl AuthStrategy for AnthropicApiAuth {
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>> {
        info!("🔍 [AnthropicApiAuth] 开始获取认证头部, 账号ID: {}", account.id);
        
        let mut headers = HashMap::new();
        
        // AnthropicApi类型：使用session_key或access_token
        let api_key = account.credentials.session_key.as_ref()
            .or(account.credentials.access_token.as_ref());
        
        if let Some(key) = api_key {
            info!("🔍 [AnthropicApiAuth] API密钥长度: {}, 前缀: {}", 
                  key.len(), 
                  if key.len() > 10 { &key[..10] } else { key });
            
            // 对于Anthropic API，根据key的格式选择认证方式
            if key.starts_with("sk-ant-") {
                info!("🔍 [AnthropicApiAuth] 使用 x-api-key 认证方式");
                headers.insert("x-api-key".to_string(), key.clone());
            } else {
                info!("🔍 [AnthropicApiAuth] 使用 Authorization Bearer 认证方式");
                headers.insert("Authorization".to_string(), format!("Bearer {}", key));
            }
            
            info!("✅ [AnthropicApiAuth] 认证头部设置完成");
            Ok(headers)
        } else {
            error!("❌ [AnthropicApiAuth] 缺少认证信息");
            Err(AppError::Business("Anthropic API账号缺少认证信息".to_string()))
        }
    }
    
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool> {
        // 简单验证：检查是否有session_key或access_token
        let has_credentials = account.credentials.session_key.is_some() 
            || account.credentials.access_token.is_some();
        Ok(has_credentials)
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::anthropic_api()
    }
}