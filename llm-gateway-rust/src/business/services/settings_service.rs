use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};
use crate::{
    infrastructure::database::Database,
    shared::error::{AppError, AppResult},
};

/// 设置缓存项
#[derive(Debug, Clone)]
pub struct SettingValue {
    pub value: String,
    pub value_type: String,
}

/// 系统设置服务
/// 负责从数据库加载设置并提供缓存的访问接口
#[derive(Debug)]
pub struct SettingsService {
    database: Database,
    cache: Arc<RwLock<HashMap<String, SettingValue>>>,
}

impl SettingsService {
    /// 创建新的设置服务实例
    pub fn new(database: Database) -> Self {
        Self {
            database,
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 初始化设置缓存
    pub async fn initialize(&self) -> AppResult<()> {
        info!("⚙️ 初始化系统设置缓存");
        self.reload_cache().await?;
        info!("✅ 系统设置缓存初始化成功");
        Ok(())
    }

    /// 重新加载设置缓存
    pub async fn reload_cache(&self) -> AppResult<()> {
        let settings_rows = sqlx::query!(
            "SELECT key, value, value_type FROM system_settings ORDER BY key"
        )
        .fetch_all(self.database.pool())
        .await
        .map_err(|e| AppError::Database(e))?;

        let mut new_cache = HashMap::new();
        for row in settings_rows {
            info!("🔧 加载设置: {} = {}", row.key, row.value);
            new_cache.insert(row.key.clone(), SettingValue {
                value: row.value,
                value_type: row.value_type,
            });
        }

        *self.cache.write().await = new_cache;
        Ok(())
    }

    /// 获取字符串设置值
    pub async fn get_string(&self, key: &str, default: &str) -> String {
        if let Some(setting) = self.cache.read().await.get(key) {
            setting.value.clone()
        } else {
            warn!("⚠️ 设置项不存在，使用默认值: {} = {}", key, default);
            default.to_string()
        }
    }

    /// 获取整数设置值
    pub async fn get_i32(&self, key: &str, default: i32) -> i32 {
        if let Some(setting) = self.cache.read().await.get(key) {
            setting.value.parse().unwrap_or_else(|_| {
                warn!("⚠️ 设置项解析失败，使用默认值: {} = {}", key, default);
                default
            })
        } else {
            warn!("⚠️ 设置项不存在，使用默认值: {} = {}", key, default);
            default
        }
    }

    /// 获取布尔设置值
    pub async fn get_bool(&self, key: &str, default: bool) -> bool {
        if let Some(setting) = self.cache.read().await.get(key) {
            setting.value.parse().unwrap_or_else(|_| {
                warn!("⚠️ 设置项解析失败，使用默认值: {} = {}", key, default);
                default
            })
        } else {
            warn!("⚠️ 设置项不存在，使用默认值: {} = {}", key, default);
            default
        }
    }

    /// 获取浮点设置值
    pub async fn get_f64(&self, key: &str, default: f64) -> f64 {
        if let Some(setting) = self.cache.read().await.get(key) {
            setting.value.parse().unwrap_or_else(|_| {
                warn!("⚠️ 设置项解析失败，使用默认值: {} = {}", key, default);
                default
            })
        } else {
            warn!("⚠️ 设置项不存在，使用默认值: {} = {}", key, default);
            default
        }
    }

    // 基础设置访问方法
    pub async fn get_system_name(&self) -> String {
        self.get_string("system_name", "LLM Gateway").await
    }

    pub async fn get_system_description(&self) -> String {
        self.get_string("system_description", "智能大语言模型网关服务").await
    }

    pub async fn get_max_users(&self) -> i32 {
        self.get_i32("max_users", 100).await
    }

    pub async fn get_max_api_keys(&self) -> i32 {
        self.get_i32("max_api_keys", 1000).await
    }

    // 安全设置访问方法
    pub async fn get_password_min_length(&self) -> i32 {
        self.get_i32("password_min_length", 8).await
    }

    pub async fn get_token_expiry_hours(&self) -> i32 {
        self.get_i32("token_expiry_hours", 24).await
    }

    pub async fn get_max_login_attempts(&self) -> i32 {
        self.get_i32("max_login_attempts", 5).await
    }

    // 限流设置访问方法
    pub async fn get_rate_limit_per_minute(&self) -> i32 {
        self.get_i32("rate_limit_per_minute", 60).await
    }

    pub async fn get_max_requests_per_day(&self) -> i32 {
        self.get_i32("max_requests_per_day", 10000).await
    }

    // 缓存设置访问方法
    pub async fn is_cache_enabled(&self) -> bool {
        self.get_bool("cache_enabled", true).await
    }

    pub async fn get_cache_ttl_minutes(&self) -> i32 {
        self.get_i32("cache_ttl_minutes", 30).await
    }

    // 日志设置访问方法
    pub async fn get_log_level(&self) -> String {
        self.get_string("log_level", "INFO").await
    }

    pub async fn get_log_retention_days(&self) -> i32 {
        self.get_i32("log_retention_days", 30).await
    }

    // 通知设置访问方法
    pub async fn is_email_notifications_enabled(&self) -> bool {
        self.get_bool("email_notifications", false).await
    }

    pub async fn is_webhook_notifications_enabled(&self) -> bool {
        self.get_bool("webhook_notifications", false).await
    }

    pub async fn get_alert_threshold(&self) -> i32 {
        self.get_i32("alert_threshold", 95).await
    }

    /// 在设置更新后刷新缓存
    pub async fn on_settings_updated(&self) -> AppResult<()> {
        info!("🔄 检测到设置更新，刷新缓存");
        self.reload_cache().await?;
        info!("✅ 设置缓存刷新完成");
        Ok(())
    }
}

/// 全局设置服务实例
pub type SharedSettingsService = Arc<SettingsService>;