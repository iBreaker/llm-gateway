//! Anthropic 请求构建器

use std::collections::HashMap;
use async_trait::async_trait;
use tracing::info;

use crate::business::domain::{UpstreamAccount, ServiceProvider, AuthMethod, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::RequestBuilder;

/// Anthropic 请求构建器
pub struct AnthropicRequestBuilder;

#[async_trait]
impl RequestBuilder for AnthropicRequestBuilder {
    fn build_upstream_url(&self, account: &UpstreamAccount, path: &str, query: Option<&str>) -> AppResult<String> {
        // 优先使用账号配置中的base_url，否则使用默认值
        let base_url = if let Some(custom_base_url) = &account.credentials.base_url {
            custom_base_url.as_str()
        } else {
            // 使用配置中的默认base_url
            account.provider_config.default_base_url()
        };

        // 直接使用请求路径，不做假设
        let full_path = if let Some(query_params) = query {
            format!("{}?{}", path, query_params)
        } else {
            path.to_string()
        };

        Ok(format!("{}{}", base_url, full_path))
    }
    
    fn filter_headers(&self, 
        headers: &HashMap<String, String>, 
        account: &UpstreamAccount
    ) -> HashMap<String, String> {
        let mut filtered_headers = HashMap::new();
        let is_oauth = account.provider_config.is_oauth();
        
        for (key, value) in headers {
            let key_lower = key.to_lowercase();
            let should_skip = key_lower == "authorization" 
                || key_lower == "host" 
                || key_lower == "connection"
                || (is_oauth && key_lower == "anthropic-beta"); // OAuth账号过滤客户端的beta头部
                
            if !should_skip {
                filtered_headers.insert(key.clone(), value.clone());
                info!("🔍 [AnthropicRequestBuilder] 转发头部: '{}': '{}'", key, value);
            } else {
                let reason = if key_lower == "anthropic-beta" && is_oauth {
                    "OAuth账号使用专用beta头部"
                } else {
                    "安全过滤"
                };
                info!("🔍 [AnthropicRequestBuilder] 过滤头部: '{}' ({})", key, reason);
            }
        }
        
        filtered_headers
    }
    
    fn add_provider_headers(&self, account: &UpstreamAccount) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        
        // Anthropic 特定头部
        if account.provider_config.is_oauth() {
            // OAuth版本已在认证策略中添加anthropic-beta头部
        } else {
            // API版本可能需要特定的版本头部
        }
        
        headers
    }
    
    fn supported_config(&self) -> ProviderConfig {
        // 支持Anthropic的两种认证方式，这里返回API Key版本作为默认
        ProviderConfig::anthropic_api()
    }
}