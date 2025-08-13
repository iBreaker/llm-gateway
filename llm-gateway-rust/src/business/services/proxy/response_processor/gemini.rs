//! Google Gemini 响应处理器

use async_trait::async_trait;
use std::pin::Pin;
use futures_util::{Stream, StreamExt};
use bytes::Bytes;
use tracing::{info, error};
use serde_json::Value;

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::{ResponseProcessor, TokenUsage};

/// Google Gemini 响应处理器
pub struct GeminiResponseProcessor;

#[async_trait]
impl ResponseProcessor for GeminiResponseProcessor {
    async fn process_response_stream(
        &self,
        response_stream: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
        account: &UpstreamAccount,
        request_id: &str,
    ) -> Pin<Box<dyn Stream<Item = AppResult<Bytes>> + Send + Sync>> {
        let request_id_clone = request_id.to_string();
        let account_id = account.id;
        
        // Gemini可能需要特殊的响应格式转换
        let processed_stream = response_stream
            .map(move |result| {
                match result {
                    Ok(bytes) => {
                        // 这里可以添加Gemini响应格式到OpenAI格式的转换逻辑
                        // TODO: 实现Gemini->OpenAI响应格式转换
                        Ok(bytes)
                    }
                    Err(e) => {
                        error!("❌ [{}] [GeminiResponseProcessor] 读取流式响应体失败: {}", request_id_clone, e);
                        Err(AppError::ExternalService(format!("读取流式响应体失败: {}", e)))
                    }
                }
            });

        info!("🔍 [{}] [GeminiResponseProcessor] ✅ 流式响应体处理就绪 (账号: {})", request_id, account_id);
        Box::pin(processed_stream)
    }
    
    async fn parse_token_usage(&self, 
        response_body: &[u8], 
        account: &UpstreamAccount
    ) -> AppResult<TokenUsage> {
        // 尝试解析Gemini响应格式中的token使用情况
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(json_value) = serde_json::from_str::<Value>(response_text) {
                // Gemini响应格式可能不同，需要根据实际API文档调整
                // 示例: { "usageMetadata": { "promptTokenCount": 100, "candidatesTokenCount": 50, "totalTokenCount": 150 } }
                if let Some(usage) = json_value.get("usageMetadata") {
                    let prompt_tokens = usage.get("promptTokenCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let candidates_tokens = usage.get("candidatesTokenCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let total_tokens = usage.get("totalTokenCount")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(prompt_tokens + candidates_tokens) as u32;
                    
                    info!("🔍 [GeminiResponseProcessor] Token使用统计 (账号: {}): 提示={}, 候选={}, 总计={}", 
                          account.id, prompt_tokens, candidates_tokens, total_tokens);
                    
                    return Ok(TokenUsage {
                        input_tokens: prompt_tokens,
                        output_tokens: candidates_tokens,
                        cache_creation_tokens: 0, // Gemini缓存机制可能不同
                        cache_read_tokens: 0,
                        total_tokens,
                        tokens_per_second: None,
                    });
                }
            }
        }
        
        // 如果解析失败，返回估算值
        let estimated_tokens = 100;
        info!("🔍 [GeminiResponseProcessor] 使用估算Token值: {} (账号: {})", estimated_tokens, account.id);
        
        Ok(TokenUsage {
            input_tokens: estimated_tokens / 2,
            output_tokens: estimated_tokens / 2,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            total_tokens: estimated_tokens,
            tokens_per_second: None,
        })
    }
    
    fn calculate_cost(&self, token_usage: &TokenUsage, _account: &UpstreamAccount) -> f64 {
        // Gemini定价（概略）: 根据实际定价调整
        let input_cost = (token_usage.input_tokens as f64 / 1000.0) * 0.001;
        let output_cost = (token_usage.output_tokens as f64 / 1000.0) * 0.002;
        
        input_cost + output_cost
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::gemini_api()
    }
}