//! Alibaba Qwen 响应处理器

use async_trait::async_trait;
use std::pin::Pin;
use futures_util::{Stream, StreamExt};
use bytes::Bytes;
use tracing::{info, error};
use serde_json::Value;

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::{ResponseProcessor, TokenUsage};

/// Alibaba Qwen 响应处理器
pub struct QwenResponseProcessor;

#[async_trait]
impl ResponseProcessor for QwenResponseProcessor {
    async fn process_response_stream(
        &self,
        response_stream: Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>,
        account: &UpstreamAccount,
        request_id: &str,
    ) -> Pin<Box<dyn Stream<Item = AppResult<Bytes>> + Send>> {
        let request_id_clone = request_id.to_string();
        let account_id = account.id;
        
        // Qwen可能需要特殊的响应格式转换
        let processed_stream = response_stream
            .map(move |result| {
                match result {
                    Ok(bytes) => {
                        // 这里可以添加Qwen响应格式到OpenAI格式的转换逻辑
                        // TODO: 实现Qwen->OpenAI响应格式转换
                        Ok(bytes)
                    }
                    Err(e) => {
                        error!("❌ [{}] [QwenResponseProcessor] 读取流式响应体失败: {}", request_id_clone, e);
                        Err(AppError::ExternalService(format!("读取流式响应体失败: {}", e)))
                    }
                }
            });

        info!("🔍 [{}] [QwenResponseProcessor] ✅ 流式响应体处理就绪 (账号: {})", request_id, account_id);
        Box::pin(processed_stream)
    }
    
    async fn parse_token_usage(&self, 
        response_body: &[u8], 
        account: &UpstreamAccount
    ) -> AppResult<TokenUsage> {
        // 尝试解析Qwen响应格式中的token使用情况
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(json_value) = serde_json::from_str::<Value>(response_text) {
                // Qwen响应格式可能类似：{ "usage": { "input_tokens": 100, "output_tokens": 50, "total_tokens": 150 } }
                if let Some(usage) = json_value.get("usage") {
                    let input_tokens = usage.get("input_tokens")
                        .or_else(|| usage.get("prompt_tokens"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let output_tokens = usage.get("output_tokens")
                        .or_else(|| usage.get("completion_tokens"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let total_tokens = usage.get("total_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or((input_tokens + output_tokens) as u64) as u32;
                    
                    info!("🔍 [QwenResponseProcessor] Token使用统计 (账号: {}): 输入={}, 输出={}, 总计={}", 
                          account.id, input_tokens, output_tokens, total_tokens);
                    
                    return Ok(TokenUsage {
                        input_tokens,
                        output_tokens,
                        cache_creation_tokens: 0, // Qwen可能不支持缓存
                        cache_read_tokens: 0,
                        total_tokens,
                        tokens_per_second: None,
                    });
                }
            }
        }
        
        // 如果解析失败，返回估算值
        let estimated_tokens = 100;
        info!("🔍 [QwenResponseProcessor] 使用估算Token值: {} (账号: {})", estimated_tokens, account.id);
        
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
        // Qwen定价（概略）: 根据实际定价调整
        let input_cost = (token_usage.input_tokens as f64 / 1000.0) * 0.0008;
        let output_cost = (token_usage.output_tokens as f64 / 1000.0) * 0.002;
        
        input_cost + output_cost
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::qwen_oauth()
    }
}