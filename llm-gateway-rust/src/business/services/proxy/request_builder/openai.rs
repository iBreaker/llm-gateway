//! OpenAI 请求构建器

use std::collections::HashMap;
use async_trait::async_trait;
use tracing::info;

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::RequestBuilder;

/// OpenAI 请求构建器
pub struct OpenAiRequestBuilder;

#[async_trait]
impl RequestBuilder for OpenAiRequestBuilder {
    fn build_upstream_url(&self, account: &UpstreamAccount, path: &str, query: Option<&str>) -> AppResult<String> {
        // 优先使用账号配置中的base_url，否则使用默认值
        let base_url = if let Some(custom_base_url) = &account.credentials.base_url {
            custom_base_url.as_str()
        } else {
            account.provider_config.default_base_url()
        };

        // OpenAI路径转换逻辑（如果需要）
        let converted_path = match path {
            // 可以在这里添加OpenAI特定的路径转换
            _ => path
        };

        let full_path = if let Some(query_params) = query {
            format!("{}?{}", converted_path, query_params)
        } else {
            converted_path.to_string()
        };

        Ok(format!("{}{}", base_url, full_path))
    }
    
    fn filter_headers(&self, 
        headers: &HashMap<String, String>, 
        _account: &UpstreamAccount
    ) -> HashMap<String, String> {
        let mut filtered_headers = HashMap::new();
        
        for (key, value) in headers {
            let key_lower = key.to_lowercase();
            let should_skip = key_lower == "authorization" 
                || key_lower == "host" 
                || key_lower == "connection";
                
            if !should_skip {
                filtered_headers.insert(key.clone(), value.clone());
                info!("🔍 [OpenAiRequestBuilder] 转发头部: '{}': '{}'", key, value);
            } else {
                info!("🔍 [OpenAiRequestBuilder] 过滤头部: '{}' (安全过滤)", key);
            }
        }
        
        filtered_headers
    }
    
    fn add_provider_headers(&self, _account: &UpstreamAccount) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        
        // OpenAI 可能需要的特定头部
        // headers.insert("OpenAI-Organization".to_string(), "org-xxx".to_string());
        
        headers
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::openai_api()
    }
}