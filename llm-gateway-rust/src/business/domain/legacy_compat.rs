//! 临时兼容性模块
//! 提供旧的 AccountProvider 枚举以支持现有代码

use serde::{Deserialize, Serialize};

/// 旧的账号提供商枚举（向后兼容）
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AccountProvider {
    AnthropicApi,
    AnthropicOauth,
    GeminiOauth,
    QwenOauth,
}

impl AccountProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            AccountProvider::AnthropicApi => "anthropic_api",
            AccountProvider::AnthropicOauth => "anthropic_oauth",
            AccountProvider::GeminiOauth => "gemini_oauth",
            AccountProvider::QwenOauth => "qwen_oauth",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, String> {
        match s {
            "anthropic_api" => Ok(AccountProvider::AnthropicApi),
            "anthropic_oauth" => Ok(AccountProvider::AnthropicOauth),
            "gemini_oauth" => Ok(AccountProvider::GeminiOauth),
            "qwen_oauth" => Ok(AccountProvider::QwenOauth),
            _ => Err(format!("Unknown provider: {}", s)),
        }
    }

    pub fn provider_name(&self) -> &'static str {
        match self {
            AccountProvider::AnthropicApi => "Anthropic",
            AccountProvider::AnthropicOauth => "Anthropic",
            AccountProvider::GeminiOauth => "Gemini",
            AccountProvider::QwenOauth => "Qwen",
        }
    }
}