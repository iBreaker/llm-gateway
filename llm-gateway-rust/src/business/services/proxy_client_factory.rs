//! 代理HTTP客户端工厂
//! 
//! 根据代理配置创建对应的HTTP客户端

use std::time::Duration;
use reqwest::{Client, Proxy};
use tracing::{info, error, debug};

use crate::business::domain::{ProxyConfig, ProxyType};
use crate::shared::{AppError, AppResult};

/// 代理HTTP客户端工厂
pub struct ProxyClientFactory;

impl ProxyClientFactory {
    /// 根据代理配置创建HTTP客户端
    pub fn create_client(proxy_config: Option<&ProxyConfig>) -> AppResult<Client> {
        let mut client_builder = Client::builder()
            .timeout(Duration::from_secs(300))      // 5分钟超时
            .connect_timeout(Duration::from_secs(10)) // 连接超时10秒
            .pool_idle_timeout(Duration::from_secs(90)) // 连接池空闲超时
            .tcp_keepalive(Duration::from_secs(60))   // TCP保活
            .no_gzip();  // 禁用自动gzip处理，避免压缩响应问题

        // 如果配置了代理，添加代理设置
        if let Some(proxy) = proxy_config {
            if proxy.enabled {
                info!("🔗 配置代理客户端：{} ({}://{}:{})", 
                      proxy.name, proxy.proxy_type.as_str(), proxy.host, proxy.port);
                
                let reqwest_proxy = Self::create_reqwest_proxy(proxy)?;
                client_builder = client_builder.proxy(reqwest_proxy);
                
                debug!("✅ 代理配置已应用到HTTP客户端");
            } else {
                info!("🔗 代理已禁用，使用直连模式");
            }
        } else {
            info!("🔗 未配置代理，使用直连模式");
        }

        client_builder.build()
            .map_err(|e| {
                error!("❌ 创建HTTP客户端失败: {}", e);
                AppError::Business(format!("创建HTTP客户端失败: {}", e))
            })
    }

    /// 创建reqwest代理对象
    fn create_reqwest_proxy(proxy_config: &ProxyConfig) -> AppResult<Proxy> {
        let proxy_url = proxy_config.to_proxy_url();
        
        debug!("🔧 创建reqwest代理: {}", proxy_url);

        let mut reqwest_proxy = match proxy_config.proxy_type {
            ProxyType::Http => {
                Proxy::http(&proxy_url)
                    .map_err(|e| AppError::Business(format!("创建HTTP代理失败: {}", e)))?
            },
            ProxyType::Https => {
                Proxy::https(&proxy_url)
                    .map_err(|e| AppError::Business(format!("创建HTTPS代理失败: {}", e)))?
            },
            ProxyType::Socks5 => {
                // reqwest支持SOCKS5代理
                Proxy::all(&proxy_url)
                    .map_err(|e| AppError::Business(format!("创建SOCKS5代理失败: {}", e)))?
            },
        };

        // 配置代理认证
        if let Some(auth) = &proxy_config.auth {
            debug!("🔐 配置代理认证: 用户名 {}", auth.username);
            reqwest_proxy = reqwest_proxy.basic_auth(&auth.username, &auth.password);
        }

        Ok(reqwest_proxy)
    }

    /// 验证代理连接
    pub async fn validate_proxy(proxy_config: &ProxyConfig) -> AppResult<bool> {
        if !proxy_config.enabled {
            return Ok(false);
        }

        info!("🔍 验证代理连接: {} ({}://{}:{})", 
              proxy_config.name, proxy_config.proxy_type.as_str(), 
              proxy_config.host, proxy_config.port);

        // 创建测试用的HTTP客户端
        let test_client = Self::create_client(Some(proxy_config))?;

        // 使用httpbin.org进行连接测试
        let test_url = "https://httpbin.org/ip";
        
        match test_client
            .get(test_url)
            .timeout(Duration::from_secs(10))
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status.is_success() {
                    info!("✅ 代理连接验证成功: {}", proxy_config.name);
                    
                    // 可选：记录通过代理获取的IP地址用于验证
                    if let Ok(body) = response.text().await {
                        debug!("📡 通过代理获取的响应: {}", body);
                    }
                    
                    Ok(true)
                } else {
                    error!("❌ 代理连接验证失败: {} - HTTP状态码: {}", 
                           proxy_config.name, status);
                    Ok(false)
                }
            },
            Err(e) => {
                error!("❌ 代理连接验证异常: {} - 错误: {}", proxy_config.name, e);
                
                // 检查具体的错误类型
                if e.is_timeout() {
                    error!("⏰ 代理连接超时");
                } else if e.is_connect() {
                    error!("🔌 无法连接到代理服务器");
                } else {
                    error!("🚫 其他网络错误: {}", e);
                }
                
                Ok(false)
            }
        }
    }

    /// 测试代理性能（延迟测试）
    pub async fn test_proxy_latency(proxy_config: &ProxyConfig) -> AppResult<Duration> {
        if !proxy_config.enabled {
            return Err(AppError::Business("代理未启用".to_string()));
        }

        info!("⏱️  测试代理延迟: {}", proxy_config.name);

        let test_client = Self::create_client(Some(proxy_config))?;
        let test_url = "https://httpbin.org/status/200";

        let start_time = std::time::Instant::now();
        
        match test_client
            .get(test_url)
            .timeout(Duration::from_secs(30))
            .send()
            .await
        {
            Ok(response) => {
                let latency = start_time.elapsed();
                
                if response.status().is_success() {
                    info!("📊 代理延迟测试完成: {} - 延迟: {:?}", 
                          proxy_config.name, latency);
                    Ok(latency)
                } else {
                    error!("❌ 代理延迟测试失败: HTTP状态码: {}", response.status());
                    Err(AppError::Business(format!("代理返回错误状态: {}", response.status())))
                }
            },
            Err(e) => {
                let latency = start_time.elapsed();
                error!("❌ 代理延迟测试异常: {} - 耗时: {:?} - 错误: {}", 
                       proxy_config.name, latency, e);
                Err(AppError::Business(format!("代理延迟测试失败: {}", e)))
            }
        }
    }

    /// 获取通过代理的外部IP地址
    pub async fn get_external_ip(proxy_config: &ProxyConfig) -> AppResult<String> {
        if !proxy_config.enabled {
            return Err(AppError::Business("代理未启用".to_string()));
        }

        let test_client = Self::create_client(Some(proxy_config))?;
        let test_url = "https://httpbin.org/ip";

        match test_client
            .get(test_url)
            .timeout(Duration::from_secs(15))
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    let body = response.text().await
                        .map_err(|e| AppError::Business(format!("读取响应失败: {}", e)))?;
                    
                    // 解析JSON响应获取IP地址
                    if let Ok(json_response) = serde_json::from_str::<serde_json::Value>(&body) {
                        if let Some(origin) = json_response.get("origin").and_then(|v| v.as_str()) {
                            info!("🌐 通过代理获取的外部IP: {} (代理: {})", origin, proxy_config.name);
                            return Ok(origin.to_string());
                        }
                    }
                    
                    Err(AppError::Business("无法解析IP地址响应".to_string()))
                } else {
                    Err(AppError::Business(format!("获取外部IP失败: HTTP {}", response.status())))
                }
            },
            Err(e) => {
                Err(AppError::Business(format!("获取外部IP异常: {}", e)))
            }
        }
    }

    /// 创建无代理的直连客户端
    pub fn create_direct_client() -> AppResult<Client> {
        Self::create_client(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::domain::ProxyConfig;

    #[tokio::test]
    async fn test_direct_client_creation() {
        let client = ProxyClientFactory::create_direct_client();
        assert!(client.is_ok());
    }

    #[test]
    fn test_proxy_client_creation() {
        let proxy_config = ProxyConfig::http(
            "test-proxy".to_string(),
            "Test HTTP Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        );

        let client = ProxyClientFactory::create_client(Some(&proxy_config));
        assert!(client.is_ok());
    }

    #[test]
    fn test_disabled_proxy_client_creation() {
        let proxy_config = ProxyConfig::http(
            "test-proxy".to_string(),
            "Test HTTP Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        ).with_enabled(false);

        let client = ProxyClientFactory::create_client(Some(&proxy_config));
        assert!(client.is_ok());
    }
}