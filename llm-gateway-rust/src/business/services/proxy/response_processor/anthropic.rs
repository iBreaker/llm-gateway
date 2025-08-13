//! Anthropic 响应处理器

use async_trait::async_trait;
use std::pin::Pin;
use futures_util::{Stream, StreamExt};
use bytes::Bytes;
use tracing::{info, error};
use serde_json::Value;

use crate::business::domain::{UpstreamAccount, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::{ResponseProcessor, TokenUsage};

/// Anthropic 响应处理器
pub struct AnthropicResponseProcessor;

#[async_trait]
impl ResponseProcessor for AnthropicResponseProcessor {
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
                    error!("❌ [{}] [AnthropicResponseProcessor] 读取流式响应体失败: {}", request_id_clone, e);
                    AppError::ExternalService(format!("读取流式响应体失败: {}", e))
                })
            });

        info!("🔍 [{}] [AnthropicResponseProcessor] ✅ 流式响应体处理就绪 (账号: {})", request_id, account_id);
        Box::pin(processed_stream)
    }
    
    async fn parse_token_usage(&self, 
        response_body: &[u8], 
        account: &UpstreamAccount
    ) -> AppResult<TokenUsage> {
        // 尝试解析Anthropic响应格式中的token使用情况
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(json_value) = serde_json::from_str::<Value>(response_text) {
                // Anthropic响应格式: { "usage": { "input_tokens": 100, "output_tokens": 50 } }
                if let Some(usage) = json_value.get("usage") {
                    let input_tokens = usage.get("input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let output_tokens = usage.get("output_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let cache_creation_tokens = usage.get("cache_creation_input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    let cache_read_tokens = usage.get("cache_read_input_tokens")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                        
                    let total_tokens = input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens;
                    
                    info!("🔍 [AnthropicResponseProcessor] Token使用统计 (账号: {}): 输入={}, 输出={}, 缓存创建={}, 缓存读取={}, 总计={}", 
                          account.id, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens);
                    
                    return Ok(TokenUsage {
                        input_tokens,
                        output_tokens,
                        cache_creation_tokens,
                        cache_read_tokens,
                        total_tokens,
                        tokens_per_second: None,
                    });
                }
            }
        }
        
        // 如果解析失败，返回估算值
        let estimated_tokens = 100;
        info!("🔍 [AnthropicResponseProcessor] 使用估算Token值: {} (账号: {})", estimated_tokens, account.id);
        
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
        // Anthropic定价（概略）: 输入$0.003/1K tokens, 输出$0.015/1K tokens
        let input_cost = (token_usage.input_tokens as f64 / 1000.0) * 0.003;
        let output_cost = (token_usage.output_tokens as f64 / 1000.0) * 0.015;
        let cache_creation_cost = (token_usage.cache_creation_tokens as f64 / 1000.0) * 0.003 * 1.25; // 缓存创建额外25%费用
        let cache_read_cost = (token_usage.cache_read_tokens as f64 / 1000.0) * 0.003 * 0.1; // 缓存读取90%折扣
        
        input_cost + output_cost + cache_creation_cost + cache_read_cost
    }
    
    fn supported_config(&self) -> ProviderConfig {
        ProviderConfig::anthropic_api()
    }
}