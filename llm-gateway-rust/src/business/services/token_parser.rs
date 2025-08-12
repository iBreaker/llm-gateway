use serde::Deserialize;
use serde_json::Value;
use crate::business::services::{TokenUsage};

/// Anthropic Claude API 响应中的使用统计
#[derive(Debug, Deserialize)]
pub struct AnthropicUsage {
    pub input_tokens: Option<u32>,
    pub output_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
    pub cache_read_input_tokens: Option<u32>,
}

/// Google Gemini API 响应中的使用统计
#[derive(Debug, Deserialize)]
pub struct GeminiUsageMetadata {
    #[serde(rename = "promptTokenCount")]
    pub prompt_token_count: Option<u32>,
    #[serde(rename = "candidatesTokenCount")]
    pub candidates_token_count: Option<u32>,
    #[serde(rename = "totalTokenCount")]
    pub total_token_count: Option<u32>,
    #[serde(rename = "cachedContentTokenCount")]
    pub cached_content_token_count: Option<u32>,
}

/// Claude API 完整响应结构（用于解析）
#[derive(Debug, Deserialize)]
pub struct ClaudeResponse {
    pub id: Option<String>,
    pub model: Option<String>,
    pub usage: Option<AnthropicUsage>,
    pub content: Option<Value>,
}

/// Gemini API 完整响应结构（用于解析）
#[derive(Debug, Deserialize)]
pub struct GeminiResponse {
    pub candidates: Option<Vec<Value>>,
    #[serde(rename = "usageMetadata")]
    pub usage_metadata: Option<GeminiUsageMetadata>,
}

/// Token解析器
pub struct TokenParser;

impl TokenParser {
    /// 从上游API响应中解析Token使用情况
    pub fn parse_token_usage(
        response_body: &[u8], 
        provider: &str, 
        model_name: Option<&str>
    ) -> TokenUsage {
        match provider.to_lowercase().as_str() {
            "anthropic" | "claude" | "claude_code" => {
                Self::parse_anthropic_tokens(response_body, model_name)
            }
            "gemini" | "google" | "gemini_cli" => {
                Self::parse_gemini_tokens(response_body, model_name)
            }
            _ => {
                // 未知提供商，尝试通用解析
                Self::parse_generic_tokens(response_body)
            }
        }
    }

    /// 解析Anthropic Claude API的Token使用情况
    fn parse_anthropic_tokens(response_body: &[u8], model_name: Option<&str>) -> TokenUsage {
        // 尝试解析JSON响应
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(claude_response) = serde_json::from_str::<ClaudeResponse>(response_text) {
                if let Some(usage) = claude_response.usage {
                    let input_tokens = usage.input_tokens.unwrap_or(0);
                    let output_tokens = usage.output_tokens.unwrap_or(0);
                    let cache_creation_tokens = usage.cache_creation_input_tokens.unwrap_or(0);
                    let cache_read_tokens = usage.cache_read_input_tokens.unwrap_or(0);
                    
                    return TokenUsage {
                        input_tokens,
                        output_tokens,
                        cache_creation_tokens,
                        cache_read_tokens,
                        total_tokens: input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens,
                        tokens_per_second: None, // 稍后计算
                    };
                }
            }
        }

        // 如果JSON解析失败，尝试基于内容长度估算
        Self::estimate_tokens_from_content(response_body, model_name)
    }

    /// 解析Google Gemini API的Token使用情况
    fn parse_gemini_tokens(response_body: &[u8], model_name: Option<&str>) -> TokenUsage {
        // 尝试解析JSON响应
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(gemini_response) = serde_json::from_str::<GeminiResponse>(response_text) {
                if let Some(usage_metadata) = gemini_response.usage_metadata {
                    let input_tokens = usage_metadata.prompt_token_count.unwrap_or(0);
                    let output_tokens = usage_metadata.candidates_token_count.unwrap_or(0);
                    let cached_tokens = usage_metadata.cached_content_token_count.unwrap_or(0);
                    
                    // Gemini的缓存Token通常是读取缓存，很少有创建缓存的情况
                    return TokenUsage {
                        input_tokens,
                        output_tokens,
                        cache_creation_tokens: 0,
                        cache_read_tokens: cached_tokens,
                        total_tokens: input_tokens + output_tokens + cached_tokens,
                        tokens_per_second: None,
                    };
                }
            }
        }

        // 如果JSON解析失败，尝试基于内容长度估算
        Self::estimate_tokens_from_content(response_body, model_name)
    }

    /// 通用Token解析（适用于未知提供商）
    fn parse_generic_tokens(response_body: &[u8]) -> TokenUsage {
        // 尝试查找常见的Token字段
        if let Ok(response_text) = std::str::from_utf8(response_body) {
            if let Ok(json_value) = serde_json::from_str::<Value>(response_text) {
                // 尝试查找常见的Token字段名
                let possible_usage_paths = [
                    ["usage"],
                    ["usageMetadata"],
                    ["usage_metadata"],
                    ["token_usage"],
                ];

                for path in &possible_usage_paths {
                    if let Some(usage_obj) = Self::get_nested_value(&json_value, path) {
                        if let Some(token_usage) = Self::extract_tokens_from_object(usage_obj) {
                            return token_usage;
                        }
                    }
                }
            }
        }

        // 最后的备选方案：基于内容长度估算
        Self::estimate_tokens_from_content(response_body, None)
    }

    /// 基于内容长度估算Token数量
    fn estimate_tokens_from_content(response_body: &[u8], model_name: Option<&str>) -> TokenUsage {
        let content_length = response_body.len();
        
        // 根据模型调整估算比例
        let chars_per_token = match model_name {
            Some(model) if model.contains("chinese") => 2.0, // 中文模型
            Some(model) if model.contains("code") => 3.0,    // 代码模型
            _ => 4.0, // 默认英文模型，约4字符=1token
        };

        let estimated_total_tokens = (content_length as f64 / chars_per_token) as u32;
        
        // 假设70%输入，30%输出的比例
        let estimated_input = (estimated_total_tokens as f64 * 0.7) as u32;
        let estimated_output = estimated_total_tokens - estimated_input;

        TokenUsage {
            input_tokens: estimated_input,
            output_tokens: estimated_output,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            total_tokens: estimated_total_tokens,
            tokens_per_second: None,
        }
    }

    /// 从JSON对象中提取Token信息
    fn extract_tokens_from_object(usage_obj: &Value) -> Option<TokenUsage> {
        let input_tokens = Self::extract_token_field(usage_obj, &[
            "input_tokens", "inputTokens", "prompt_tokens", "promptTokens", "promptTokenCount"
        ]).unwrap_or(0);

        let output_tokens = Self::extract_token_field(usage_obj, &[
            "output_tokens", "outputTokens", "completion_tokens", "completionTokens", 
            "candidates_token_count", "candidatesTokenCount"
        ]).unwrap_or(0);

        let cache_creation_tokens = Self::extract_token_field(usage_obj, &[
            "cache_creation_input_tokens", "cache_creation_tokens", "cacheCreationTokens"
        ]).unwrap_or(0);

        let cache_read_tokens = Self::extract_token_field(usage_obj, &[
            "cache_read_input_tokens", "cache_read_tokens", "cached_tokens", 
            "cachedTokens", "cached_content_token_count", "cachedContentTokenCount"
        ]).unwrap_or(0);

        let total_tokens = Self::extract_token_field(usage_obj, &[
            "total_tokens", "totalTokens", "total_token_count", "totalTokenCount"
        ]).unwrap_or(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens);

        Some(TokenUsage {
            input_tokens,
            output_tokens,
            cache_creation_tokens,
            cache_read_tokens,
            total_tokens,
            tokens_per_second: None,
        })
    }

    /// 提取特定Token字段
    fn extract_token_field(obj: &Value, field_names: &[&str]) -> Option<u32> {
        for field_name in field_names {
            if let Some(value) = obj.get(field_name) {
                if let Some(num) = value.as_u64() {
                    return Some(num as u32);
                }
                if let Some(num) = value.as_i64() {
                    return Some(num.max(0) as u32);
                }
            }
        }
        None
    }

    /// 获取嵌套JSON值
    fn get_nested_value<'a>(json: &'a Value, path: &[&str]) -> Option<&'a Value> {
        let mut current = json;
        for segment in path {
            current = current.get(segment)?;
        }
        Some(current)
    }

    /// 计算Token生成速度
    pub fn calculate_tokens_per_second(total_tokens: u32, latency_ms: u32) -> Option<f64> {
        if latency_ms > 0 {
            Some((total_tokens as f64) / (latency_ms as f64 / 1000.0))
        } else {
            None
        }
    }

    /// 从模型名称推断提供商
    pub fn infer_provider_from_model(model_name: &str) -> String {
        let model_lower = model_name.to_lowercase();
        
        if model_lower.contains("claude") {
            "anthropic".to_string()
        } else if model_lower.contains("gemini") || model_lower.contains("bard") {
            "google".to_string()  
        } else if model_lower.contains("gpt") || model_lower.contains("davinci") {
            "openai".to_string()
        } else {
            "unknown".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_anthropic_tokens() {
        let response_json = r#"{
            "id": "msg_123",
            "model": "claude-3.5-sonnet",
            "usage": {
                "input_tokens": 150,
                "output_tokens": 300,
                "cache_creation_input_tokens": 50,
                "cache_read_input_tokens": 25
            }
        }"#;

        let token_usage = TokenParser::parse_anthropic_tokens(response_json.as_bytes(), Some("claude-3.5-sonnet"));
        
        assert_eq!(token_usage.input_tokens, 150);
        assert_eq!(token_usage.output_tokens, 300);
        assert_eq!(token_usage.cache_creation_tokens, 50);
        assert_eq!(token_usage.cache_read_tokens, 25);
        assert_eq!(token_usage.total_tokens, 525);
    }

    #[test]
    fn test_parse_gemini_tokens() {
        let response_json = r#"{
            "candidates": [],
            "usageMetadata": {
                "promptTokenCount": 200,
                "candidatesTokenCount": 400,
                "totalTokenCount": 600,
                "cachedContentTokenCount": 100
            }
        }"#;

        let token_usage = TokenParser::parse_gemini_tokens(response_json.as_bytes(), Some("gemini-pro"));
        
        assert_eq!(token_usage.input_tokens, 200);
        assert_eq!(token_usage.output_tokens, 400);
        assert_eq!(token_usage.cache_creation_tokens, 0);
        assert_eq!(token_usage.cache_read_tokens, 100);
        assert_eq!(token_usage.total_tokens, 700);
    }

    #[test]
    fn test_calculate_tokens_per_second() {
        let tps = TokenParser::calculate_tokens_per_second(1000, 2000); // 1000 tokens in 2 seconds
        assert_eq!(tps, Some(500.0));
        
        let tps_zero = TokenParser::calculate_tokens_per_second(1000, 0);
        assert_eq!(tps_zero, None);
    }

    #[test]
    fn test_infer_provider_from_model() {
        assert_eq!(TokenParser::infer_provider_from_model("claude-3.5-sonnet"), "anthropic");
        assert_eq!(TokenParser::infer_provider_from_model("gemini-pro"), "google");
        assert_eq!(TokenParser::infer_provider_from_model("gpt-4"), "openai");
        assert_eq!(TokenParser::infer_provider_from_model("unknown-model"), "unknown");
    }
}