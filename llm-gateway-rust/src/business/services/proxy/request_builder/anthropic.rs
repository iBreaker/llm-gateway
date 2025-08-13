//! Anthropic 请求构建器

use std::collections::HashMap;
use async_trait::async_trait;
use tracing::{info, warn};
use serde_json::Value;

use crate::business::domain::{UpstreamAccount, ServiceProvider, AuthMethod, ProviderConfig};
use crate::shared::{AppError, AppResult};
use super::super::traits::RequestBuilder;

/// 获取模型的max_tokens上限
fn get_model_max_tokens(model_name: &str) -> u64 {
    match model_name {
        // Claude 3.5 Sonnet
        "claude-3-5-sonnet-20241022" | "claude-3-5-sonnet-20240620" => 8192,
        // Claude 3.5 Haiku
        "claude-3-5-haiku-20241022" => 8192,
        // Claude 3 Opus
        "claude-3-opus-20240229" => 4096,
        // Claude 3 Sonnet
        "claude-3-sonnet-20240229" => 4096,
        // Claude 3 Haiku
        "claude-3-haiku-20240307" => 4096,
        // 默认值
        _ => 4096
    }
}

/// Anthropic 请求构建器
pub struct AnthropicRequestBuilder;

#[async_trait]
impl RequestBuilder for AnthropicRequestBuilder {
    fn build_upstream_url(&self, account: &UpstreamAccount, path: &str, query: Option<&str>) -> AppResult<String> {
        // 优先使用账号配置中的base_url，否则使用默认值
        let base_url = if let Some(custom_base_url) = &account.credentials.base_url {
            custom_base_url.as_str()
        } else {
            // 使用配置中的默认base_url
            account.provider_config.default_base_url()
        };

        // 直接使用请求路径，不做假设
        let full_path = if let Some(query_params) = query {
            format!("{}?{}", path, query_params)
        } else {
            path.to_string()
        };

        Ok(format!("{}{}", base_url, full_path))
    }
    
    fn filter_headers(&self, 
        headers: &HashMap<String, String>, 
        account: &UpstreamAccount
    ) -> HashMap<String, String> {
        let mut filtered_headers = HashMap::new();
        let is_oauth = account.provider_config.is_oauth();
        
        for (key, value) in headers {
            let key_lower = key.to_lowercase();
            let should_skip = key_lower == "authorization" 
                || key_lower == "host" 
                || key_lower == "connection"
                || key_lower == "content-length" // 过滤Content-Length，让reqwest自动计算
                || key_lower == "x-api-key" // 过滤掉内部系统的API Key
                || (is_oauth && key_lower == "anthropic-beta"); // OAuth账号过滤客户端的beta头部
                
            if !should_skip {
                filtered_headers.insert(key.clone(), value.clone());
                info!("🔍 [AnthropicRequestBuilder] 转发头部: '{}': '{}'", key, value);
            } else {
                let reason = if key_lower == "anthropic-beta" && is_oauth {
                    "OAuth账号使用专用beta头部"
                } else {
                    "安全过滤"
                };
                info!("🔍 [AnthropicRequestBuilder] 过滤头部: '{}' ({})", key, reason);
            }
        }
        
        // 处理User-Agent：如果不是Claude Code相关的，替换成Claude CLI标准格式
        let mut has_user_agent = false;
        let mut is_claude_code_ua = false;
        
        for (key, value) in filtered_headers.iter() {
            if key.to_lowercase() == "user-agent" {
                has_user_agent = true;
                let value_lower = value.to_lowercase();
                // 检查是否是Claude Code相关的User-Agent
                is_claude_code_ua = value_lower.contains("claude-cli") 
                    || value_lower.contains("claude-code") 
                    || value_lower.contains("anthropic");
                break;
            }
        }
        
        if !has_user_agent {
            // 没有User-Agent，添加Claude CLI标准格式
            filtered_headers.insert("User-Agent".to_string(), "claude-cli/1.0.57 (external, cli)".to_string());
            info!("🔍 [AnthropicRequestBuilder] 添加默认 User-Agent: claude-cli/1.0.57 (external, cli)");
        } else if !is_claude_code_ua {
            // 有User-Agent但不是Claude Code相关的，替换成Claude CLI标准格式
            filtered_headers.insert("User-Agent".to_string(), "claude-cli/1.0.57 (external, cli)".to_string());
            info!("🔍 [AnthropicRequestBuilder] 替换 User-Agent 为 Claude CLI 标准格式: claude-cli/1.0.57 (external, cli)");
        } else {
            info!("🔍 [AnthropicRequestBuilder] 保留客户端的 Claude Code User-Agent");
        }
        
        filtered_headers
    }
    
    fn add_provider_headers(&self, account: &UpstreamAccount) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        
        // 添加 Anthropic 标准头部
        info!("🔍 [AnthropicRequestBuilder] 添加Anthropic标准头部");
        
        // 1. anthropic-version - 总是添加API版本
        headers.insert("anthropic-version".to_string(), "2023-06-01".to_string());
        info!("🔍 [AnthropicRequestBuilder] 添加 anthropic-version: 2023-06-01");
        
        // 2. anthropic-beta - 根据认证方式添加合适的beta标志
        let beta_flags = match account.provider_config.auth_method {
            AuthMethod::OAuth => {
                // OAuth账号使用完整的Claude Code beta标志
                "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
            },
            AuthMethod::ApiKey => {
                // API Key账号使用基础的Claude Code beta标志
                "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
            }
        };
        headers.insert("anthropic-beta".to_string(), beta_flags.to_string());
        info!("🔍 [AnthropicRequestBuilder] 添加 anthropic-beta: {}", beta_flags);
        
        // 3. User-Agent - 不覆盖客户端的User-Agent，只在没有的时候添加默认值
        // 注意：这里不添加User-Agent，让客户端的User-Agent通过filter_headers转发
        
        info!("✅ [AnthropicRequestBuilder] Anthropic标准头部添加完成");
        headers
    }
    
    fn transform_request_body(&self, 
        body: &[u8], 
        _account: &UpstreamAccount,
        request_id: &str
    ) -> AppResult<Vec<u8>> {
        info!("🔍 [{}] [AnthropicRequestBuilder] 开始Body转换 - 注入Claude Code身份", request_id);
        
        // 解析原始JSON
        let body_str = std::str::from_utf8(body)
            .map_err(|e| AppError::Business(format!("请求体不是有效的UTF-8: {}", e)))?;
        
        let mut body_json: Value = serde_json::from_str(body_str)
            .map_err(|e| AppError::Business(format!("请求体不是有效的JSON: {}", e)))?;
        
        // 获取JSON对象
        let body_obj = body_json.as_object_mut()
            .ok_or_else(|| AppError::Business("请求体必须是JSON对象".to_string()))?;
        
        // 1. 处理system字段 - 智能注入Claude Code身份（避免重复）
        use serde_json::Map;
        
        // 检查现有system中是否已包含Claude Code身份
        let mut has_claude_code_identity = false;
        let mut existing_system_array = Vec::new();
        
        if let Some(existing_system) = body_obj.remove("system") {
            match existing_system {
                Value::String(text) if !text.trim().is_empty() => {
                    // 字符串形式的system，检查是否包含Claude Code身份
                    if text.contains("You are Claude Code") || text.contains("Claude Code") {
                        has_claude_code_identity = true;
                    }
                    let mut user_obj = Map::new();
                    user_obj.insert("type".to_string(), Value::String("text".to_string()));
                    user_obj.insert("text".to_string(), Value::String(text));
                    existing_system_array.push(Value::Object(user_obj));
                },
                Value::Array(arr) => {
                    // 数组形式的system，检查每个元素
                    for item in &arr {
                        if let Some(obj) = item.as_object() {
                            if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                                if text.contains("You are Claude Code") || text.contains("Claude Code") {
                                    has_claude_code_identity = true;
                                    break;
                                }
                            }
                        }
                    }
                    existing_system_array = arr;
                },
                _ => {} // 忽略其他类型
            }
        }
        
        let mut new_system = Vec::new();
        
        // 只有在不存在Claude Code身份时才注入
        if !has_claude_code_identity {
            let mut claude_code_obj = Map::new();
            claude_code_obj.insert("type".to_string(), Value::String("text".to_string()));
            claude_code_obj.insert("text".to_string(), Value::String("You are Claude Code, Anthropic's official CLI for Claude.".to_string()));
            
            let mut cache_control = Map::new();
            cache_control.insert("type".to_string(), Value::String("ephemeral".to_string()));
            claude_code_obj.insert("cache_control".to_string(), Value::Object(cache_control));
            
            new_system.push(Value::Object(claude_code_obj));
            info!("🔍 [{}] [AnthropicRequestBuilder] 注入Claude Code身份", request_id);
        } else {
            info!("🔍 [{}] [AnthropicRequestBuilder] 检测到已存在Claude Code身份，跳过注入", request_id);
        }
        
        // 添加原有的system内容
        new_system.extend(existing_system_array);
        
        info!("🔍 [{}] [AnthropicRequestBuilder] 最终system数组长度: {}", request_id, new_system.len());
        for (i, item) in new_system.iter().enumerate() {
            if let Some(obj) = item.as_object() {
                if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                    let preview = if text.len() > 50 { &text[..50] } else { text };
                    info!("🔍 [{}] [AnthropicRequestBuilder] system[{}]: {}...", request_id, i, preview);
                }
            }
        }
        
        body_obj.insert("system".to_string(), Value::Array(new_system));
        
        // 2. 处理max_tokens限制
        if let Some(max_tokens) = body_obj.get("max_tokens").and_then(|v| v.as_u64()) {
            let model = body_obj.get("model").and_then(|v| v.as_str()).unwrap_or("");
            let limit = get_model_max_tokens(model);
            
            if max_tokens > limit {
                body_obj.insert("max_tokens".to_string(), Value::Number(limit.into()));
                info!("🔍 [{}] [AnthropicRequestBuilder] 调整max_tokens: {} -> {}", 
                      request_id, max_tokens, limit);
            }
        }
        
        // 序列化转换后的JSON
        let transformed_body = serde_json::to_string(&body_json)
            .map_err(|e| AppError::Business(format!("序列化转换后的请求体失败: {}", e)))?;
        
        // 调试：详细记录转换过程
        info!("🔍 [{}] [AnthropicRequestBuilder] 原始body长度: {} bytes", request_id, body.len());
        info!("🔍 [{}] [AnthropicRequestBuilder] 原始body内容: {}", request_id, 
              std::str::from_utf8(body).unwrap_or("无效UTF-8"));
        info!("🔍 [{}] [AnthropicRequestBuilder] 转换后body长度: {} bytes", request_id, transformed_body.len());
        info!("🔍 [{}] [AnthropicRequestBuilder] 转换后body内容: {}", request_id, transformed_body);
        
        let result_bytes = transformed_body.into_bytes();
        info!("🔍 [{}] [AnthropicRequestBuilder] 最终字节数组长度: {} bytes", request_id, result_bytes.len());
        
        info!("🔍 [{}] [AnthropicRequestBuilder] ✅ Body转换完成，Claude Code身份已注入", request_id);
        Ok(result_bytes)
    }
    
    fn supported_config(&self) -> ProviderConfig {
        // 支持Anthropic的两种认证方式，这里返回API Key版本作为默认
        ProviderConfig::anthropic_api()
    }
}