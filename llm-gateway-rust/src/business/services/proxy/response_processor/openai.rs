//! OpenAI 响应处理器

use async_trait::async_trait;
use std::pin::Pin;
use futures_util::{Stream, StreamExt};
use bytes::Bytes;
use tracing::{info, error};
use serde_json::Value;

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::{ResponseProcessor, TokenUsage};

/// OpenAI 响应处理器
pub struct OpenAiResponseProcessor;

#[async_trait]
impl ResponseProcessor for OpenAiResponseProcessor {
    async fn process_response_stream(
        &self,
        response_stream: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
        account: &UpstreamAccount,
        request_id: &str,
    ) -> Pin<Box<dyn Stream<Item = AppResult<Bytes>> + Send + Sync>> {
        let request_id_clone = request_id.to_string();
        let account_id = account.id;
        
        let processed_stream = response_stream
            .map(move |result| {
                result.map_err(|e| {
                    error!("❌ [{}] [OpenAiResponseProcessor] 读取流式响应体失败: {}", request_id_clone, e);
                    AppError::ExternalService(format!("读取流式响应体失败: {}", e))
                })
            });

        info!("🔍 [{}] [OpenAiResponseProcessor] ✅ 流式响应体处理就绪 (账号: {})", request_id, account_id);
        Box::pin(processed_stream)
    }
    
    async fn parse_token_usage(&self, 
        response_body: &[u8], 
        account: &UpstreamAccount
    ) -> AppResult<TokenUsage> {
        // 尝试解析OpenAI响应格式中的token使用情况
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(json_value) = serde_json::from_str::<Value>(response_text) {
                // OpenAI响应格式: { "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 } }
                if let Some(usage) = json_value.get("usage") {
                    let prompt_tokens = usage.get("prompt_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let completion_tokens = usage.get("completion_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let total_tokens = usage.get("total_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(prompt_tokens + completion_tokens) as u32;
                    
                    info!("🔍 [OpenAiResponseProcessor] Token使用统计 (账号: {}): 提示={}, 完成={}, 总计={}", 
                          account.id, prompt_tokens, completion_tokens, total_tokens);
                    
                    return Ok(TokenUsage {
                        input_tokens: prompt_tokens,
                        output_tokens: completion_tokens,
                        cache_creation_tokens: 0, // OpenAI暂不支持缓存
                        cache_read_tokens: 0,
                        total_tokens,
                        tokens_per_second: None,
                    });
                }
            }
        }
        
        // 如果解析失败，返回估算值
        let estimated_tokens = 100;
        info!("🔍 [OpenAiResponseProcessor] 使用估算Token值: {} (账号: {})", estimated_tokens, account.id);
        
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
        // OpenAI定价（概略）: 输入$0.0015/1K tokens, 输出$0.002/1K tokens
        let input_cost = (token_usage.input_tokens as f64 / 1000.0) * 0.0015;
        let output_cost = (token_usage.output_tokens as f64 / 1000.0) * 0.002;
        
        input_cost + output_cost
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::openai_api()
    }
}