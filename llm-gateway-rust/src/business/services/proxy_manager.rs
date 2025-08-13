//! 系统代理管理服务
//! 
//! 负责系统级代理配置的管理和持久化

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, error, debug};

use crate::business::domain::{SystemProxyConfig, ProxyConfig};
use crate::business::services::proxy_client_factory::ProxyClientFactory;
use crate::infrastructure::database::ProxyRepository;
use crate::shared::{AppError, AppResult};

/// 系统代理管理服务
pub struct SystemProxyManager {
    config: Arc<RwLock<SystemProxyConfig>>,
    proxy_repo: ProxyRepository,
}

impl SystemProxyManager {
    /// 创建新的系统代理管理器
    pub fn new(proxy_repo: ProxyRepository) -> Self {
        Self {
            config: Arc::new(RwLock::new(SystemProxyConfig::new())),
            proxy_repo,
        }
    }

    /// 从配置创建系统代理管理器
    pub fn new_with_config(config: SystemProxyConfig, proxy_repo: ProxyRepository) -> Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            proxy_repo,
        }
    }

    /// 从数据库初始化代理配置
    pub async fn initialize_from_database(&self) -> AppResult<()> {
        info!("🔄 从数据库初始化代理配置");
        
        let db_proxies = self.proxy_repo.list_all().await?;
        let mut config = self.config.write().await;
        
        for proxy in db_proxies {
            info!("📥 加载代理配置: {} ({})", proxy.name, proxy.id);
            if let Err(e) = config.add_proxy(proxy) {
                error!("⚠️  加载代理配置失败: {}", e);
            }
        }
        
        info!("✅ 代理配置初始化完成，共加载 {} 个代理", config.proxies.len());
        Ok(())
    }

    /// 获取配置的只读引用
    pub async fn get_config(&self) -> SystemProxyConfig {
        self.config.read().await.clone()
    }

    /// 获取配置的Arc引用（用于在其他服务中共享）
    pub fn get_config_arc(&self) -> Arc<RwLock<SystemProxyConfig>> {
        Arc::clone(&self.config)
    }

    /// 添加代理配置
    pub async fn add_proxy(&self, proxy: ProxyConfig) -> AppResult<()> {
        info!("➕ 添加代理配置: {} ({}://{}:{})", 
              proxy.name, proxy.proxy_type.as_str(), proxy.host, proxy.port);

        let mut config = self.config.write().await;
        config.add_proxy(proxy.clone())
            .map_err(|e| AppError::Business(e))?;

        info!("✅ 代理配置已添加: {}", proxy.id);
        Ok(())
    }

    /// 更新代理配置
    pub async fn update_proxy(&self, proxy: ProxyConfig) -> AppResult<()> {
        info!("✏️  更新代理配置: {} ({}://{}:{})", 
              proxy.name, proxy.proxy_type.as_str(), proxy.host, proxy.port);

        let mut config = self.config.write().await;
        config.update_proxy(proxy.clone())
            .map_err(|e| AppError::Business(e))?;

        info!("✅ 代理配置已更新: {}", proxy.id);
        Ok(())
    }

    /// 删除代理配置
    pub async fn remove_proxy(&self, proxy_id: &str) -> AppResult<()> {
        info!("🗑️  删除代理配置: {}", proxy_id);

        let mut config = self.config.write().await;
        config.remove_proxy(proxy_id)
            .map_err(|e| AppError::Business(e))?;

        info!("✅ 代理配置已删除: {}", proxy_id);
        Ok(())
    }

    /// 获取代理配置
    pub async fn get_proxy(&self, proxy_id: &str) -> Option<ProxyConfig> {
        let config = self.config.read().await;
        config.get_proxy(proxy_id).cloned()
    }

    /// 从数据库获取代理配置（绕过内存缓存）
    pub async fn get_proxy_from_db(&self, proxy_id: &str) -> AppResult<Option<ProxyConfig>> {
        self.proxy_repo.get_by_id(proxy_id).await
    }

    /// 获取所有代理配置
    pub async fn list_proxies(&self) -> Vec<ProxyConfig> {
        let config = self.config.read().await;
        config.list_proxies().into_iter().cloned().collect()
    }

    /// 获取启用的代理配置
    pub async fn list_enabled_proxies(&self) -> Vec<ProxyConfig> {
        let config = self.config.read().await;
        config.get_enabled_proxies().into_iter().cloned().collect()
    }

    /// 设置默认代理
    pub async fn set_default_proxy(&self, proxy_id: Option<String>) -> AppResult<()> {
        info!("🎯 设置默认代理: {:?}", proxy_id);

        let mut config = self.config.write().await;
        config.set_default_proxy(proxy_id.clone())
            .map_err(|e| AppError::Business(e))?;

        info!("✅ 默认代理已设置: {:?}", proxy_id);
        Ok(())
    }

    /// 获取默认代理配置
    pub async fn get_default_proxy(&self) -> Option<ProxyConfig> {
        let config = self.config.read().await;
        config.get_default_proxy().cloned()
    }

    /// 启用/禁用全局代理
    pub async fn set_global_proxy_enabled(&self, enabled: bool) -> AppResult<()> {
        info!("🌐 设置全局代理状态: {}", if enabled { "启用" } else { "禁用" });

        let mut config = self.config.write().await;
        config.global_proxy_enabled = enabled;

        info!("✅ 全局代理状态已更新: {}", if enabled { "启用" } else { "禁用" });
        Ok(())
    }

    /// 检查全局代理状态
    pub async fn is_global_proxy_enabled(&self) -> bool {
        let config = self.config.read().await;
        config.global_proxy_enabled
    }

    /// 验证代理连接
    pub async fn validate_proxy(&self, proxy_id: &str) -> AppResult<bool> {
        let proxy_config = self.get_proxy(proxy_id).await
            .ok_or_else(|| AppError::Business(format!("代理配置不存在: {}", proxy_id)))?;

        info!("🔍 验证代理连接: {}", proxy_config.name);
        
        match ProxyClientFactory::validate_proxy(&proxy_config).await {
            Ok(is_valid) => {
                if is_valid {
                    info!("✅ 代理连接验证成功: {}", proxy_config.name);
                } else {
                    error!("❌ 代理连接验证失败: {}", proxy_config.name);
                }
                Ok(is_valid)
            },
            Err(e) => {
                error!("❌ 代理连接验证异常: {} - {}", proxy_config.name, e);
                Err(e)
            }
        }
    }

    /// 测试代理延迟
    pub async fn test_proxy_latency(&self, proxy_id: &str) -> AppResult<std::time::Duration> {
        let proxy_config = self.get_proxy(proxy_id).await
            .ok_or_else(|| AppError::Business(format!("代理配置不存在: {}", proxy_id)))?;

        info!("⏱️  测试代理延迟: {}", proxy_config.name);
        
        ProxyClientFactory::test_proxy_latency(&proxy_config).await
    }

    /// 获取代理的外部IP地址
    pub async fn get_proxy_external_ip(&self, proxy_id: &str) -> AppResult<String> {
        let proxy_config = self.get_proxy(proxy_id).await
            .ok_or_else(|| AppError::Business(format!("代理配置不存在: {}", proxy_id)))?;

        info!("🌐 获取代理外部IP: {}", proxy_config.name);
        
        ProxyClientFactory::get_external_ip(&proxy_config).await
    }

    /// 批量验证所有启用的代理
    pub async fn validate_all_enabled_proxies(&self) -> Vec<(String, bool)> {
        let enabled_proxies = self.list_enabled_proxies().await;
        let mut results = Vec::new();

        info!("🔍 批量验证 {} 个启用的代理", enabled_proxies.len());

        for proxy in enabled_proxies {
            debug!("验证代理: {}", proxy.name);
            
            match ProxyClientFactory::validate_proxy(&proxy).await {
                Ok(is_valid) => {
                    results.push((proxy.id.clone(), is_valid));
                    if is_valid {
                        debug!("✅ 代理 {} 验证成功", proxy.name);
                    } else {
                        debug!("❌ 代理 {} 验证失败", proxy.name);
                    }
                },
                Err(e) => {
                    error!("❌ 代理 {} 验证异常: {}", proxy.name, e);
                    results.push((proxy.id.clone(), false));
                }
            }
        }

        info!("🏁 批量验证完成: {}/{} 个代理通过验证", 
              results.iter().filter(|(_, valid)| *valid).count(), 
              results.len());

        results
    }

    /// 获取代理统计信息
    pub async fn get_proxy_statistics(&self) -> ProxyStatistics {
        let config = self.config.read().await;
        
        let total_proxies = config.proxies.len();
        let enabled_proxies = config.get_enabled_proxies().len();
        let disabled_proxies = total_proxies - enabled_proxies;
        let has_default_proxy = config.default_proxy_id.is_some();
        let global_proxy_enabled = config.global_proxy_enabled;

        ProxyStatistics {
            total_proxies,
            enabled_proxies,
            disabled_proxies,
            has_default_proxy,
            global_proxy_enabled,
            default_proxy_id: config.default_proxy_id.clone(),
        }
    }
}

// 注意: 移除了 Default 实现，因为现在需要 ProxyRepository 参数

/// 代理统计信息
#[derive(Debug, Clone)]
pub struct ProxyStatistics {
    pub total_proxies: usize,
    pub enabled_proxies: usize,
    pub disabled_proxies: usize,
    pub has_default_proxy: bool,
    pub global_proxy_enabled: bool,
    pub default_proxy_id: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::domain::ProxyConfig;

    #[tokio::test]
    async fn test_proxy_manager_basic_operations() {
        let manager = SystemProxyManager::new();
        
        // 添加代理
        let proxy = ProxyConfig::http(
            "test-1".to_string(),
            "Test Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        );
        
        assert!(manager.add_proxy(proxy.clone()).await.is_ok());
        
        // 获取代理
        let retrieved = manager.get_proxy("test-1").await;
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Proxy");
        
        // 列出代理
        let proxies = manager.list_proxies().await;
        assert_eq!(proxies.len(), 1);
        
        // 设置默认代理
        assert!(manager.set_default_proxy(Some("test-1".to_string())).await.is_ok());
        let default_proxy = manager.get_default_proxy().await;
        assert!(default_proxy.is_some());
        
        // 删除代理
        assert!(manager.remove_proxy("test-1").await.is_ok());
        let deleted = manager.get_proxy("test-1").await;
        assert!(deleted.is_none());
    }

    #[tokio::test]
    async fn test_proxy_statistics() {
        let manager = SystemProxyManager::new();
        
        // 添加几个代理配置
        let proxy1 = ProxyConfig::http("proxy1".to_string(), "Proxy 1".to_string(), "127.0.0.1".to_string(), 8080);
        let proxy2 = ProxyConfig::https("proxy2".to_string(), "Proxy 2".to_string(), "127.0.0.1".to_string(), 3128).with_enabled(false);
        
        manager.add_proxy(proxy1).await.unwrap();
        manager.add_proxy(proxy2).await.unwrap();
        manager.set_global_proxy_enabled(true).await.unwrap();
        
        let stats = manager.get_proxy_statistics().await;
        assert_eq!(stats.total_proxies, 2);
        assert_eq!(stats.enabled_proxies, 1);
        assert_eq!(stats.disabled_proxies, 1);
        assert!(stats.global_proxy_enabled);
    }
}