//! Google Gemini 请求构建器

use std::collections::HashMap;
use async_trait::async_trait;
use tracing::info;

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::RequestBuilder;

/// Google Gemini 请求构建器
pub struct GeminiRequestBuilder;

#[async_trait]
impl RequestBuilder for GeminiRequestBuilder {
    fn build_upstream_url(&self, account: &UpstreamAccount, path: &str, query: Option<&str>) -> AppResult<String> {
        // 优先使用账号配置中的base_url，否则使用默认值
        let base_url = if let Some(custom_base_url) = &account.credentials.base_url {
            custom_base_url.as_str()
        } else {
            account.provider_config.default_base_url()
        };

        // Gemini可能需要特殊的路径转换
        let converted_path = match path {
            // 如果收到OpenAI格式的请求，转换为Gemini格式
            "/v1/chat/completions" => "/models/gemini-pro:generateContent",
            _ => path
        };

        // Gemini API Key 可能通过查询参数传递
        let full_path = if let Some(api_key) = &account.credentials.session_key {
            let key_param = format!("key={}", api_key);
            if let Some(existing_query) = query {
                format!("{}?{}&{}", converted_path, existing_query, key_param)
            } else {
                format!("{}?{}", converted_path, key_param)
            }
        } else if let Some(query_params) = query {
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
                info!("🔍 [GeminiRequestBuilder] 转发头部: '{}': '{}'", key, value);
            } else {
                info!("🔍 [GeminiRequestBuilder] 过滤头部: '{}' (安全过滤)", key);
            }
        }
        
        filtered_headers
    }
    
    fn add_provider_headers(&self, _account: &UpstreamAccount) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        
        // Gemini 特定头部
        headers.insert("Content-Type".to_string(), "application/json".to_string());
        
        headers
    }
    
    fn transform_request_body(&self, 
        body: &[u8], 
        _account: &UpstreamAccount,
        request_id: &str
    ) -> AppResult<Vec<u8>> {
        // Gemini 暂时不需要复杂的body转换，直接转发
        info!("🔍 [{}] [GeminiRequestBuilder] 直接转发请求体 (无需转换)", request_id);
        Ok(body.to_vec())
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::gemini_api()
    }
}