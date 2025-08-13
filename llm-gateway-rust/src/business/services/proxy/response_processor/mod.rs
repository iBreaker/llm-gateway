//! 响应处理器模块
//! 
//! 支持不同提供商的响应格式解析和Token统计

pub mod anthropic;
pub mod openai;
pub mod gemini;
pub mod qwen;

use crate::business::domain::{ProviderConfig, ServiceProvider, AuthMethod};
use super::traits::ResponseProcessor;

/// 创建响应处理器
pub fn create_response_processor(config: &ProviderConfig) -> Option<Box<dyn ResponseProcessor>> {
    match (&config.service, &config.auth_method) {
        (ServiceProvider::Anthropic, AuthMethod::ApiKey) |
        (ServiceProvider::Anthropic, AuthMethod::OAuth) => {
            Some(Box::new(anthropic::AnthropicResponseProcessor))
        },
        (ServiceProvider::OpenAI, AuthMethod::ApiKey) => {
            Some(Box::new(openai::OpenAiResponseProcessor))
        },
        (ServiceProvider::Gemini, AuthMethod::ApiKey) |
        (ServiceProvider::Gemini, AuthMethod::OAuth) => {
            Some(Box::new(gemini::GeminiResponseProcessor))
        },
        (ServiceProvider::Qwen, AuthMethod::OAuth) => {
            Some(Box::new(qwen::QwenResponseProcessor))
        },
        _ => None,
    }
}