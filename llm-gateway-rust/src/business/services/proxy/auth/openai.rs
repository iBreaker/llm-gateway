//! OpenAI API Key 认证策略

use async_trait::async_trait;
use std::collections::HashMap;
use tracing::{info, error};

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::AuthStrategy;

/// OpenAI API Key 认证
pub struct OpenAiAuth;

#[async_trait]
impl AuthStrategy for OpenAiAuth {
    async fn get_auth_headers(&self, account: &UpstreamAccount) -> AppResult<HashMap<String, String>> {
        info!("🔍 [OpenAiAuth] 开始获取认证头部, 账号ID: {}", account.id);
        
        let mut headers = HashMap::new();
        
        // OpenAI使用session_key或access_token作为API Key
        let api_key = account.credentials.session_key.as_ref()
            .or(account.credentials.access_token.as_ref());
        
        if let Some(key) = api_key {
            info!("🔍 [OpenAiAuth] API密钥长度: {}, 前缀: {}", 
                  key.len(), 
                  if key.len() > 10 { &key[..10] } else { key });
            
            // OpenAI 统一使用 Authorization Bearer
            headers.insert("Authorization".to_string(), format!("Bearer {}", key));
            
            info!("✅ [OpenAiAuth] 认证头部设置完成");
            Ok(headers)
        } else {
            error!("❌ [OpenAiAuth] 缺少认证信息");
            Err(AppError::Business("OpenAI账号缺少认证信息".to_string()))
        }
    }
    
    async fn validate_credentials(&self, account: &UpstreamAccount) -> AppResult<bool> {
        // 简单验证：检查是否有session_key或access_token
        let has_credentials = account.credentials.session_key.is_some() 
            || account.credentials.access_token.is_some();
        Ok(has_credentials)
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::openai_api()
    }
}