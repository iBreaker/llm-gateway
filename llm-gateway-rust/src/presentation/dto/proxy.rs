//! 代理请求API数据传输对象
//! 
//! 新架构：支持多种服务提供商和认证方式的代理请求

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 代理请求结构
#[derive(Debug, Deserialize)]
pub struct ProxyRequest {
    /// 目标服务提供商（可选，由路由决策确定）
    pub target_provider: Option<String>,
    /// 模型名称
    pub model: String,
    /// 请求内容
    #[serde(flatten)]
    pub content: ProxyRequestContent,
    /// 路由策略偏好
    pub routing_preference: Option<String>,
    /// 是否强制使用指定提供商
    pub force_provider: Option<bool>,
}

/// 代理请求内容（支持不同类型的请求）
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum ProxyRequestContent {
    #[serde(rename = "chat")]
    Chat {
        messages: Vec<ChatMessage>,
        #[serde(flatten)]
        options: ChatOptions,
    },
    #[serde(rename = "completion")]
    Completion {
        prompt: String,
        #[serde(flatten)]
        options: CompletionOptions,
    },
    #[serde(rename = "count_tokens")]
    CountTokens {
        text: String,
    },
}

/// 聊天消息
#[derive(Debug, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,    // "user", "assistant", "system"
    pub content: String,
}

/// 聊天选项
#[derive(Debug, Deserialize)]
pub struct ChatOptions {
    pub max_tokens: Option<i32>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub stream: Option<bool>,
    pub stop: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// 补全选项
#[derive(Debug, Deserialize)]
pub struct CompletionOptions {
    pub max_tokens: Option<i32>,
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub stream: Option<bool>,
    pub stop: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// 代理响应
#[derive(Debug, Serialize)]
pub struct ProxyResponse {
    /// 响应内容
    #[serde(flatten)]
    pub content: ProxyResponseContent,
    /// 路由信息
    pub routing_info: RoutingInfo,
    /// 使用统计
    pub usage: UsageInfo,
    /// 性能指标
    pub performance: PerformanceInfo,
}

/// 代理响应内容
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum ProxyResponseContent {
    #[serde(rename = "chat")]
    Chat {
        id: String,
        object: String,
        created: i64,
        model: String,
        choices: Vec<ChatChoice>,
    },
    #[serde(rename = "completion")]
    Completion {
        id: String,
        object: String,
        created: i64,
        model: String,
        choices: Vec<CompletionChoice>,
    },
    #[serde(rename = "count_tokens")]
    CountTokens {
        token_count: i32,
    },
    #[serde(rename = "error")]
    Error {
        error: ErrorInfo,
    },
}

/// 聊天选择
#[derive(Debug, Serialize)]
pub struct ChatChoice {
    pub index: i32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

/// 补全选择
#[derive(Debug, Serialize)]
pub struct CompletionChoice {
    pub index: i32,
    pub text: String,
    pub finish_reason: Option<String>,
}

/// 错误信息
#[derive(Debug, Serialize)]
pub struct ErrorInfo {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}

/// 路由信息
#[derive(Debug, Serialize)]
pub struct RoutingInfo {
    pub selected_provider: String,
    pub selected_account_id: i64,
    pub routing_strategy: String,
    pub confidence_score: f64,
    pub reasoning: String,
    pub fallback_used: bool,
    pub retry_count: i32,
}

/// 使用信息
#[derive(Debug, Serialize)]
pub struct UsageInfo {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cache_creation_tokens: i32,
    pub cache_read_tokens: i32,
    pub total_tokens: i32,
    pub cost_usd: f64,
}

/// 性能信息
#[derive(Debug, Serialize)]
pub struct PerformanceInfo {
    pub total_latency_ms: i32,
    pub first_token_latency_ms: Option<i32>,
    pub tokens_per_second: Option<f64>,
    pub queue_time_ms: i32,
    pub cache_hit_rate: Option<f64>,
}

/// 流式响应事件
#[derive(Debug, Serialize)]
pub struct StreamEvent {
    #[serde(rename = "type")]
    pub event_type: String,  // "delta", "usage", "performance", "error", "done"
    pub data: serde_json::Value,
}

/// 模型列表响应
#[derive(Debug, Serialize)]
pub struct ModelsListResponse {
    pub object: String,
    pub data: Vec<ModelInfo>,
}

/// 模型信息
#[derive(Debug, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub object: String,
    pub owned_by: String,
    pub service_provider: String,
    pub auth_methods: Vec<String>,
    pub capabilities: Vec<String>,
    pub max_tokens: Option<i32>,
    pub cost_per_1k_input_tokens: Option<f64>,
    pub cost_per_1k_output_tokens: Option<f64>,
}

/// 代理健康状态
#[derive(Debug, Serialize)]
pub struct ProxyHealthResponse {
    pub status: String,  // "healthy", "degraded", "unhealthy"
    pub total_accounts: i32,
    pub healthy_accounts: i32,
    pub degraded_accounts: i32,
    pub unhealthy_accounts: i32,
    pub providers: Vec<ProviderHealth>,
    pub last_check: String,
}

/// 提供商健康状态
#[derive(Debug, Serialize)]
pub struct ProviderHealth {
    pub service_provider: String,
    pub status: String,
    pub account_count: i32,
    pub healthy_count: i32,
    pub avg_latency_ms: f64,
    pub success_rate: f64,
}

impl ProxyRequest {
    /// 验证请求参数
    pub fn validate(&self) -> Result<(), String> {
        // 验证模型名称
        if self.model.trim().is_empty() {
            return Err("模型名称不能为空".to_string());
        }

        // 验证路由策略
        if let Some(ref preference) = self.routing_preference {
            if !["load_balance", "cost_optimize", "performance", "failover"].contains(&preference.as_str()) {
                return Err("无效的路由策略偏好".to_string());
            }
        }

        // 验证目标提供商
        if let Some(ref provider) = self.target_provider {
            if !["anthropic", "openai", "gemini", "qwen"].contains(&provider.as_str()) {
                return Err("无效的目标服务提供商".to_string());
            }
        }

        // 验证请求内容
        match &self.content {
            ProxyRequestContent::Chat { messages, .. } => {
                if messages.is_empty() {
                    return Err("聊天消息不能为空".to_string());
                }
                for (i, message) in messages.iter().enumerate() {
                    if !["user", "assistant", "system"].contains(&message.role.as_str()) {
                        return Err(format!("第 {} 条消息的角色无效: {}", i + 1, message.role));
                    }
                    if message.content.trim().is_empty() {
                        return Err(format!("第 {} 条消息内容不能为空", i + 1));
                    }
                }
            }
            ProxyRequestContent::Completion { prompt, .. } => {
                if prompt.trim().is_empty() {
                    return Err("提示词不能为空".to_string());
                }
            }
            ProxyRequestContent::CountTokens { text } => {
                if text.trim().is_empty() {
                    return Err("待计算Token的文本不能为空".to_string());
                }
            }
        }

        Ok(())
    }

    /// 获取请求类型
    pub fn request_type(&self) -> &str {
        match &self.content {
            ProxyRequestContent::Chat { .. } => "chat",
            ProxyRequestContent::Completion { .. } => "completion",
            ProxyRequestContent::CountTokens { .. } => "count_tokens",
        }
    }

    /// 是否为流式请求
    pub fn is_stream(&self) -> bool {
        match &self.content {
            ProxyRequestContent::Chat { options, .. } => options.stream.unwrap_or(false),
            ProxyRequestContent::Completion { options, .. } => options.stream.unwrap_or(false),
            ProxyRequestContent::CountTokens { .. } => false,
        }
    }
}

impl ModelsListResponse {
    /// 创建模型列表响应
    pub fn new() -> Self {
        let models = vec![
            ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                object: "model".to_string(),
                owned_by: "anthropic".to_string(),
                service_provider: "anthropic".to_string(),
                auth_methods: vec!["api_key".to_string(), "oauth".to_string()],
                capabilities: vec!["chat".to_string(), "completion".to_string(), "count_tokens".to_string()],
                max_tokens: Some(200000),
                cost_per_1k_input_tokens: Some(0.003),
                cost_per_1k_output_tokens: Some(0.015),
            },
            ModelInfo {
                id: "gpt-4o".to_string(),
                object: "model".to_string(),
                owned_by: "openai".to_string(),
                service_provider: "openai".to_string(),
                auth_methods: vec!["api_key".to_string()],
                capabilities: vec!["chat".to_string(), "completion".to_string()],
                max_tokens: Some(128000),
                cost_per_1k_input_tokens: Some(0.005),
                cost_per_1k_output_tokens: Some(0.015),
            },
            ModelInfo {
                id: "gemini-1.5-pro".to_string(),
                object: "model".to_string(),
                owned_by: "google".to_string(),
                service_provider: "gemini".to_string(),
                auth_methods: vec!["api_key".to_string(), "oauth".to_string()],
                capabilities: vec!["chat".to_string(), "completion".to_string()],
                max_tokens: Some(2000000),
                cost_per_1k_input_tokens: Some(0.00125),
                cost_per_1k_output_tokens: Some(0.005),
            },
            ModelInfo {
                id: "qwen-turbo".to_string(),
                object: "model".to_string(),
                owned_by: "alibaba".to_string(),
                service_provider: "qwen".to_string(),
                auth_methods: vec!["api_key".to_string(), "oauth".to_string()],
                capabilities: vec!["chat".to_string(), "completion".to_string()],
                max_tokens: Some(131072),
                cost_per_1k_input_tokens: Some(0.0008),
                cost_per_1k_output_tokens: Some(0.002),
            },
        ];

        Self {
            object: "list".to_string(),
            data: models,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_request_validation_chat() {
        let request = ProxyRequest {
            target_provider: Some("anthropic".to_string()),
            model: "claude-3-5-sonnet".to_string(),
            content: ProxyRequestContent::Chat {
                messages: vec![
                    ChatMessage {
                        role: "user".to_string(),
                        content: "Hello".to_string(),
                    }
                ],
                options: ChatOptions {
                    max_tokens: Some(100),
                    temperature: Some(0.7),
                    top_p: None,
                    stream: Some(false),
                    stop: None,
                    extra: HashMap::new(),
                },
            },
            routing_preference: Some("performance".to_string()),
            force_provider: Some(false),
        };

        assert!(request.validate().is_ok());
        assert_eq!(request.request_type(), "chat");
        assert_eq!(request.is_stream(), false);
    }

    #[test]
    fn test_proxy_request_validation_empty_messages() {
        let request = ProxyRequest {
            target_provider: None,
            model: "gpt-4".to_string(),
            content: ProxyRequestContent::Chat {
                messages: vec![],
                options: ChatOptions {
                    max_tokens: None,
                    temperature: None,
                    top_p: None,
                    stream: None,
                    stop: None,
                    extra: HashMap::new(),
                },
            },
            routing_preference: None,
            force_provider: None,
        };

        assert!(request.validate().is_err());
        assert!(request.validate().unwrap_err().contains("聊天消息不能为空"));
    }

    #[test]
    fn test_proxy_request_invalid_provider() {
        let request = ProxyRequest {
            target_provider: Some("invalid_provider".to_string()),
            model: "test-model".to_string(),
            content: ProxyRequestContent::CountTokens {
                text: "test text".to_string(),
            },
            routing_preference: None,
            force_provider: None,
        };

        assert!(request.validate().is_err());
        assert!(request.validate().unwrap_err().contains("无效的目标服务提供商"));
    }

    #[test]
    fn test_models_list_response() {
        let response = ModelsListResponse::new();
        assert_eq!(response.object, "list");
        assert!(response.data.len() >= 4);
        
        let claude = response.data.iter().find(|m| m.service_provider == "anthropic");
        assert!(claude.is_some());
        assert!(claude.unwrap().auth_methods.contains(&"oauth".to_string()));
    }
}