//! 认证策略模块
//! 
//! 支持不同提供商的认证方式：API Key、OAuth等

pub mod anthropic_api;
pub mod anthropic_oauth;
pub mod openai;
pub mod gemini;
pub mod qwen;

use crate::business::domain::{ProviderConfig, ServiceProvider, AuthMethod};
use super::traits::AuthStrategy;

/// 创建认证策略
pub fn create_auth_strategy(config: &ProviderConfig) -> Option<Box<dyn AuthStrategy>> {
    match (&config.service, &config.auth_method) {
        (ServiceProvider::Anthropic, AuthMethod::ApiKey) => {
            Some(Box::new(anthropic_api::AnthropicApiAuth))
        },
        (ServiceProvider::Anthropic, AuthMethod::OAuth) => {
            Some(Box::new(anthropic_oauth::AnthropicOauthAuth))
        },
        (ServiceProvider::OpenAI, AuthMethod::ApiKey) => {
            Some(Box::new(openai::OpenAiAuth))
        },
        (ServiceProvider::Gemini, AuthMethod::ApiKey) => {
            Some(Box::new(gemini::GeminiAuth))
        },
        (ServiceProvider::Gemini, AuthMethod::OAuth) => {
            Some(Box::new(gemini::GeminiOAuth))
        },
        (ServiceProvider::Qwen, AuthMethod::OAuth) => {
            Some(Box::new(qwen::QwenOAuth))
        },
        _ => None,
    }
}