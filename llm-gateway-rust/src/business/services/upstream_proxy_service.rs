//! 上游账号代理服务
//! 
//! 负责处理上游账号的代理配置解析和应用

use std::sync::Arc;
use tracing::{info, error, debug};

use crate::business::domain::{UpstreamAccount, ProxyConfig, AccountProxyConfig};
use crate::business::services::proxy_manager::SystemProxyManager;
use crate::shared::AppResult;
use crate::shared::types::UpstreamAccountId;

/// 上游账号代理服务
pub struct UpstreamProxyService {
    proxy_manager: Arc<SystemProxyManager>,
}

impl UpstreamProxyService {
    /// 创建新的上游代理服务
    pub fn new(proxy_manager: Arc<SystemProxyManager>) -> Self {
        Self { proxy_manager }
    }

    /// 获取上游账号的实际代理配置
    pub async fn resolve_proxy_for_account(
        &self,
        account: &UpstreamAccount,
    ) -> AppResult<Option<ProxyConfig>> {
        debug!("解析账号 {} 的代理配置", account.id);

        // 检查账号是否有代理配置
        let account_proxy_config = match &account.proxy_config {
            Some(config) => config,
            None => {
                debug!("账号 {} 未配置代理", account.id);
                return Ok(None);
            }
        };

        // 如果代理未启用，返回 None
        if !account_proxy_config.enabled {
            debug!("账号 {} 的代理已禁用", account.id);
            return Ok(None);
        }

        // 获取代理配置
        let proxy_config = if let Some(proxy_id) = &account_proxy_config.proxy_id {
            // 使用指定的代理
            debug!("账号 {} 使用指定代理: {}", account.id, proxy_id);
            match self.proxy_manager.get_proxy_from_db(proxy_id).await? {
                Some(config) => {
                    if config.enabled {
                        Some(config)
                    } else {
                        error!("账号 {} 指定的代理 {} 已禁用", account.id, proxy_id);
                        None
                    }
                },
                None => {
                    error!("账号 {} 指定的代理 {} 不存在", account.id, proxy_id);
                    None
                }
            }
        } else {
            // 使用系统默认代理
            debug!("账号 {} 使用默认代理", account.id);
            self.proxy_manager.get_default_proxy().await
        };

        if let Some(ref config) = proxy_config {
            info!("账号 {} 将使用代理: {} ({}://{}:{})", 
                  account.id, config.name, config.proxy_type.as_str(), config.host, config.port);
        } else {
            debug!("账号 {} 无可用的代理配置", account.id);
        }

        Ok(proxy_config)
    }

    /// 批量解析多个账号的代理配置
    pub async fn resolve_proxy_for_accounts(
        &self,
        accounts: &[UpstreamAccount],
    ) -> AppResult<Vec<(UpstreamAccountId, Option<ProxyConfig>)>> {
        let mut results = Vec::with_capacity(accounts.len());

        for account in accounts {
            let proxy_config = self.resolve_proxy_for_account(account).await?;
            results.push((account.id, proxy_config));
        }

        Ok(results)
    }

    /// 验证账号的代理配置是否有效
    pub async fn validate_account_proxy(
        &self,
        account: &UpstreamAccount,
    ) -> AppResult<bool> {
        let proxy_config = match self.resolve_proxy_for_account(account).await? {
            Some(config) => config,
            None => {
                // 没有代理配置也算有效
                return Ok(true);
            }
        };

        // 验证代理连接
        match self.proxy_manager.validate_proxy(&proxy_config.id).await {
            Ok(is_valid) => {
                if is_valid {
                    info!("账号 {} 的代理 {} 验证成功", account.id, proxy_config.name);
                } else {
                    error!("账号 {} 的代理 {} 验证失败", account.id, proxy_config.name);
                }
                Ok(is_valid)
            },
            Err(e) => {
                error!("账号 {} 的代理 {} 验证异常: {}", account.id, proxy_config.name, e);
                Err(e)
            }
        }
    }

    /// 为上游账号设置代理配置
    pub async fn set_account_proxy(
        &self,
        account_id: UpstreamAccountId,
        proxy_id: Option<String>,
        enabled: bool,
    ) -> AccountProxyConfig {
        if enabled {
            if let Some(proxy_id) = proxy_id {
                info!("为账号 {} 设置代理: {}", account_id, proxy_id);
                AccountProxyConfig::enable_with_proxy(proxy_id)
            } else {
                info!("为账号 {} 启用默认代理", account_id);
                AccountProxyConfig::enable_with_default()
            }
        } else {
            info!("为账号 {} 禁用代理", account_id);
            AccountProxyConfig::disable()
        }
    }

    /// 获取账号代理配置的摘要信息
    pub async fn get_account_proxy_summary(
        &self,
        account: &UpstreamAccount,
    ) -> AppResult<AccountProxySummary> {
        let proxy_config = self.resolve_proxy_for_account(account).await?;
        
        let summary = if let Some(config) = proxy_config {
            AccountProxySummary {
                account_id: account.id,
                has_proxy: true,
                proxy_enabled: true,
                proxy_id: Some(config.id.clone()),
                proxy_name: Some(config.name.clone()),
                proxy_url: Some(format!("{}://{}:{}", config.proxy_type.as_str(), config.host, config.port)),
                is_default: account.proxy_config.as_ref()
                    .map(|pc| pc.proxy_id.is_none())
                    .unwrap_or(false),
            }
        } else {
            let has_config = account.proxy_config.is_some();
            let is_enabled = account.proxy_config.as_ref()
                .map(|pc| pc.enabled)
                .unwrap_or(false);

            AccountProxySummary {
                account_id: account.id,
                has_proxy: has_config,
                proxy_enabled: is_enabled,
                proxy_id: None,
                proxy_name: None,
                proxy_url: None,
                is_default: false,
            }
        };

        Ok(summary)
    }
}

/// 账号代理配置摘要
#[derive(Debug, Clone)]
pub struct AccountProxySummary {
    pub account_id: UpstreamAccountId,
    pub has_proxy: bool,
    pub proxy_enabled: bool,
    pub proxy_id: Option<String>,
    pub proxy_name: Option<String>,
    pub proxy_url: Option<String>,
    pub is_default: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::domain::{ProviderConfig, AccountCredentials, ProxyType};
    use chrono::Utc;

    fn create_test_account_with_proxy(proxy_id: Option<String>) -> UpstreamAccount {
        UpstreamAccount {
            id: 1,
            user_id: 1,
            provider_config: ProviderConfig::anthropic_api(),
            account_name: "Test Account".to_string(),
            credentials: AccountCredentials {
                session_key: None,
                access_token: Some("test-token".to_string()),
                refresh_token: None,
                expires_at: None,
                base_url: None,
            },
            is_active: true,
            created_at: Utc::now(),
            oauth_expires_at: None,
            oauth_scopes: None,
            proxy_config: if let Some(id) = proxy_id {
                Some(AccountProxyConfig::enable_with_proxy(id))
            } else {
                Some(AccountProxyConfig::enable_with_default())
            },
        }
    }

    #[tokio::test]
    async fn test_account_proxy_summary() {
        // 这个测试需要实际的 proxy_manager，在集成测试中实现
        // 这里只是展示测试结构
    }
}