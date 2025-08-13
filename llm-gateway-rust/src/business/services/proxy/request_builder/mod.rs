//! 请求构建器模块
//! 
//! 支持不同提供商的URL构建和头部处理

pub mod anthropic;
pub mod openai;
pub mod gemini;
pub mod qwen;

use crate::business::domain::{ProviderConfig, ServiceProvider, AuthMethod};
use super::traits::RequestBuilder;

/// 创建请求构建器
pub fn create_request_builder(config: &ProviderConfig) -> Option<Box<dyn RequestBuilder>> {
    match (&config.service, &config.auth_method) {
        (ServiceProvider::Anthropic, AuthMethod::ApiKey) |
        (ServiceProvider::Anthropic, AuthMethod::OAuth) => {
            Some(Box::new(anthropic::AnthropicRequestBuilder))
        },
        (ServiceProvider::OpenAI, AuthMethod::ApiKey) => {
            Some(Box::new(openai::OpenAiRequestBuilder))
        },
        (ServiceProvider::Gemini, AuthMethod::ApiKey) |
        (ServiceProvider::Gemini, AuthMethod::OAuth) => {
            Some(Box::new(gemini::GeminiRequestBuilder))
        },
        (ServiceProvider::Qwen, AuthMethod::OAuth) => {
            Some(Box::new(qwen::QwenRequestBuilder))
        },
        _ => None,
    }
}