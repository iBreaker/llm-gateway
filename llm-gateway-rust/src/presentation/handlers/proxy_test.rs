//! 代理连接测试处理器

use axum::{response::Json, Extension};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tracing::{info, error};

use crate::shared::{AppError, AppResult};
use crate::auth::Claims;
use crate::business::domain::proxy_config::{ProxyConfig, ProxyType, ProxyAuth};
use crate::business::services::proxy_client_factory::ProxyClientFactory;

/// 代理测试请求
#[derive(Debug, Deserialize)]
pub struct ProxyTestRequest {
    pub proxy_type: String, // "http", "https", "socks5"
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

/// 代理测试响应
#[derive(Debug, Serialize)]
pub struct ProxyTestResponse {
    pub success: bool,
    pub response_time_ms: Option<u64>,
    pub error_message: Option<String>,
    pub proxy_ip: Option<String>,
}

/// 测试代理连接
pub async fn test_proxy_connection(
    Extension(_claims): Extension<Claims>,
    Json(request): Json<ProxyTestRequest>,
) -> AppResult<Json<ProxyTestResponse>> {
    info!("🔍 测试代理连接: {}:{}", request.host, request.port);

    let start_time = Instant::now();
    
    // 构建代理配置
    let proxy_type = match request.proxy_type.as_str() {
        "http" => ProxyType::Http,
        "https" => ProxyType::Http, // https 类型映射到 http 代理 
        "socks5" => ProxyType::Socks5,
        _ => return Err(AppError::Validation("不支持的代理类型".to_string())),
    };

    let proxy_config = ProxyConfig {
        id: "test".to_string(),
        name: "测试代理".to_string(),
        proxy_type,
        host: request.host,
        port: request.port,
        auth: match (request.username, request.password) {
            (Some(username), Some(password)) => Some(ProxyAuth { username, password }),
            _ => None,
        },
        enabled: true,
        extra_config: std::collections::HashMap::new(),
    };

    // 创建带代理的HTTP客户端
    let client = match ProxyClientFactory::create_client(Some(&proxy_config)) {
        Ok(client) => client,
        Err(e) => {
            error!("创建代理客户端失败: {}", e);
            return Ok(Json(ProxyTestResponse {
                success: false,
                response_time_ms: Some(start_time.elapsed().as_millis() as u64),
                error_message: Some(format!("代理配置错误: {}", e)),
                proxy_ip: None,
            }));
        }
    };

    // 测试代理连接
    let test_url = "https://httpbin.org/ip";
    
    match client
        .get(test_url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
    {
        Ok(response) => {
            let response_time = start_time.elapsed().as_millis() as u64;
            
            if response.status().is_success() {
                // 尝试获取代理IP
                let proxy_ip = match response.text().await {
                    Ok(body) => {
                        serde_json::from_str::<serde_json::Value>(&body)
                            .ok()
                            .and_then(|json| json.get("origin").and_then(|v| v.as_str().map(|s| s.to_string())))
                    }
                    Err(_) => None,
                };

                info!("✅ 代理测试成功 (响应时间: {}ms)", response_time);
                Ok(Json(ProxyTestResponse {
                    success: true,
                    response_time_ms: Some(response_time),
                    error_message: None,
                    proxy_ip,
                }))
            } else {
                Ok(Json(ProxyTestResponse {
                    success: false,
                    response_time_ms: Some(response_time),
                    error_message: Some(format!("HTTP错误: {}", response.status())),
                    proxy_ip: None,
                }))
            }
        }
        Err(e) => {
            let response_time = start_time.elapsed().as_millis() as u64;
            error!("代理连接失败: {}", e);
            Ok(Json(ProxyTestResponse {
                success: false,
                response_time_ms: Some(response_time),
                error_message: Some(format!("连接错误: {}", e)),
                proxy_ip: None,
            }))
        }
    }
}