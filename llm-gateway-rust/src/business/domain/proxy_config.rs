//! 代理配置领域模型
//! 
//! 定义系统级和账号级代理配置

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 代理类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyType {
    /// HTTP代理（支持HTTP和HTTPS流量）
    Http,
    /// SOCKS5代理
    Socks5,
}

impl ProxyType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProxyType::Http => "http",
            ProxyType::Socks5 => "socks5",
        }
    }
    
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "http" => Some(ProxyType::Http),
            "socks5" => Some(ProxyType::Socks5),
            _ => None,
        }
    }
}

/// 代理认证配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyAuth {
    /// 用户名
    pub username: String,
    /// 密码
    pub password: String,
}

/// 单个代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    /// 代理ID（唯一标识）
    pub id: String,
    /// 代理名称（用于显示）
    pub name: String,
    /// 代理类型
    pub proxy_type: ProxyType,
    /// 代理主机
    pub host: String,
    /// 代理端口
    pub port: u16,
    /// 认证信息（可选）
    pub auth: Option<ProxyAuth>,
    /// 是否启用
    pub enabled: bool,
    /// 额外配置参数
    pub extra_config: HashMap<String, String>,
}

impl ProxyConfig {
    /// 生成代理URL
    pub fn to_proxy_url(&self) -> String {
        let auth_part = if let Some(auth) = &self.auth {
            format!("{}:{}@", auth.username, auth.password)
        } else {
            String::new()
        };
        
        format!("{}://{}{}:{}", 
            self.proxy_type.as_str(),
            auth_part,
            self.host, 
            self.port
        )
    }
    
    /// 检查代理配置是否有效
    pub fn is_valid(&self) -> bool {
        !self.host.is_empty() && 
        self.port > 0 && 
        !self.name.trim().is_empty() &&
        !self.id.trim().is_empty()
    }
    
    /// 创建HTTP代理配置
    pub fn http(id: String, name: String, host: String, port: u16) -> Self {
        Self {
            id,
            name,
            proxy_type: ProxyType::Http,
            host,
            port,
            auth: None,
            enabled: true,
            extra_config: HashMap::new(),
        }
    }
    
    
    /// 创建SOCKS5代理配置
    pub fn socks5(id: String, name: String, host: String, port: u16) -> Self {
        Self {
            id,
            name,
            proxy_type: ProxyType::Socks5,
            host,
            port,
            auth: None,
            enabled: true,
            extra_config: HashMap::new(),
        }
    }
    
    /// 设置认证信息
    pub fn with_auth(mut self, username: String, password: String) -> Self {
        self.auth = Some(ProxyAuth { username, password });
        self
    }
    
    /// 设置启用状态
    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }
}

/// 系统级代理配置管理器
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SystemProxyConfig {
    /// 所有代理配置
    pub proxies: HashMap<String, ProxyConfig>,
    /// 默认代理ID（可选）
    pub default_proxy_id: Option<String>,
    /// 全局代理开关
    pub global_proxy_enabled: bool,
}

impl SystemProxyConfig {
    /// 创建新的系统代理配置
    pub fn new() -> Self {
        Self {
            proxies: HashMap::new(),
            default_proxy_id: None,
            global_proxy_enabled: false,
        }
    }
    
    /// 添加代理配置
    pub fn add_proxy(&mut self, proxy: ProxyConfig) -> Result<(), String> {
        if !proxy.is_valid() {
            return Err("无效的代理配置".to_string());
        }
        
        if self.proxies.contains_key(&proxy.id) {
            return Err("代理ID已存在".to_string());
        }
        
        self.proxies.insert(proxy.id.clone(), proxy);
        Ok(())
    }
    
    /// 更新代理配置
    pub fn update_proxy(&mut self, proxy: ProxyConfig) -> Result<(), String> {
        if !proxy.is_valid() {
            return Err("无效的代理配置".to_string());
        }
        
        if !self.proxies.contains_key(&proxy.id) {
            return Err("代理配置不存在".to_string());
        }
        
        self.proxies.insert(proxy.id.clone(), proxy);
        Ok(())
    }
    
    /// 删除代理配置
    pub fn remove_proxy(&mut self, proxy_id: &str) -> Result<(), String> {
        if !self.proxies.contains_key(proxy_id) {
            return Err("代理配置不存在".to_string());
        }
        
        // 如果删除的是默认代理，清除默认代理设置
        if self.default_proxy_id.as_ref() == Some(&proxy_id.to_string()) {
            self.default_proxy_id = None;
        }
        
        self.proxies.remove(proxy_id);
        Ok(())
    }
    
    /// 获取代理配置
    pub fn get_proxy(&self, proxy_id: &str) -> Option<&ProxyConfig> {
        self.proxies.get(proxy_id)
    }
    
    /// 获取所有启用的代理配置
    pub fn get_enabled_proxies(&self) -> Vec<&ProxyConfig> {
        self.proxies.values().filter(|p| p.enabled).collect()
    }
    
    /// 获取默认代理配置
    pub fn get_default_proxy(&self) -> Option<&ProxyConfig> {
        if let Some(default_id) = &self.default_proxy_id {
            self.proxies.get(default_id)
        } else {
            None
        }
    }
    
    /// 设置默认代理
    pub fn set_default_proxy(&mut self, proxy_id: Option<String>) -> Result<(), String> {
        if let Some(id) = &proxy_id {
            if !self.proxies.contains_key(id) {
                return Err("代理配置不存在".to_string());
            }
        }
        
        self.default_proxy_id = proxy_id;
        Ok(())
    }
    
    /// 获取代理配置列表（用于前端显示）
    pub fn list_proxies(&self) -> Vec<&ProxyConfig> {
        self.proxies.values().collect()
    }
}

/// 账号级代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountProxyConfig {
    /// 是否启用代理
    pub enabled: bool,
    /// 指定的代理ID（如果为None则使用系统默认代理）
    pub proxy_id: Option<String>,
}

impl Default for AccountProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_id: None,
        }
    }
}

impl AccountProxyConfig {
    /// 创建新的账号代理配置
    pub fn new() -> Self {
        Self::default()
    }
    
    /// 启用代理并指定代理ID
    pub fn enable_with_proxy(proxy_id: String) -> Self {
        Self {
            enabled: true,
            proxy_id: Some(proxy_id),
        }
    }
    
    /// 启用代理使用默认配置
    pub fn enable_with_default() -> Self {
        Self {
            enabled: true,
            proxy_id: None,
        }
    }
    
    /// 禁用代理
    pub fn disable() -> Self {
        Self {
            enabled: false,
            proxy_id: None,
        }
    }
    
    /// 获取实际使用的代理配置
    pub fn resolve_proxy<'a>(&self, system_config: &'a SystemProxyConfig) -> Option<&'a ProxyConfig> {
        if !self.enabled {
            return None;
        }
        
        if let Some(proxy_id) = &self.proxy_id {
            // 使用指定的代理
            system_config.get_proxy(proxy_id)
        } else {
            // 使用系统默认代理
            system_config.get_default_proxy()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_config_validation() {
        let valid_proxy = ProxyConfig::http(
            "test-1".to_string(),
            "Test Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        );
        assert!(valid_proxy.is_valid());

        let invalid_proxy = ProxyConfig {
            id: "".to_string(),
            name: "".to_string(),
            proxy_type: ProxyType::Http,
            host: "".to_string(),
            port: 0,
            auth: None,
            enabled: true,
            extra_config: HashMap::new(),
        };
        assert!(!invalid_proxy.is_valid());
    }

    #[test]
    fn test_proxy_url_generation() {
        let proxy_without_auth = ProxyConfig::http(
            "test-1".to_string(),
            "Test Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        );
        assert_eq!(proxy_without_auth.to_proxy_url(), "http://127.0.0.1:8080");

        let proxy_with_auth = ProxyConfig::http(
            "test-2".to_string(),
            "Auth Proxy".to_string(),
            "proxy.example.com".to_string(),
            3128
        ).with_auth("user".to_string(), "pass".to_string());
        
        assert_eq!(proxy_with_auth.to_proxy_url(), "http://user:pass@proxy.example.com:3128");
    }

    #[test]
    fn test_system_proxy_config() {
        let mut system_config = SystemProxyConfig::new();
        
        let proxy = ProxyConfig::http(
            "proxy-1".to_string(),
            "Test Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        );
        
        assert!(system_config.add_proxy(proxy.clone()).is_ok());
        assert!(system_config.get_proxy("proxy-1").is_some());
        assert!(system_config.set_default_proxy(Some("proxy-1".to_string())).is_ok());
        assert!(system_config.get_default_proxy().is_some());
    }

    #[test]
    fn test_account_proxy_config() {
        let mut system_config = SystemProxyConfig::new();
        let proxy = ProxyConfig::http(
            "proxy-1".to_string(),
            "Test Proxy".to_string(),
            "127.0.0.1".to_string(),
            8080
        );
        system_config.add_proxy(proxy).unwrap();
        system_config.set_default_proxy(Some("proxy-1".to_string())).unwrap();

        let account_config = AccountProxyConfig::enable_with_default();
        assert!(account_config.resolve_proxy(&system_config).is_some());

        let disabled_config = AccountProxyConfig::disable();
        assert!(disabled_config.resolve_proxy(&system_config).is_none());
    }
}