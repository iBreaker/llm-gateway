use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc, Duration};
use tracing::{info, warn};
use crate::business::services::SharedSettingsService;

/// 速率限制记录
#[derive(Debug, Clone)]
pub struct RateLimitRecord {
    pub count: u32,
    pub window_start: DateTime<Utc>,
    pub daily_count: u32,
    pub daily_start: DateTime<Utc>,
}

impl Default for RateLimitRecord {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            count: 0,
            window_start: now,
            daily_count: 0,
            daily_start: now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc(),
        }
    }
}

/// 速率限制结果
#[derive(Debug)]
pub enum RateLimitResult {
    Allowed,
    MinuteLimitExceeded { limit: i32, reset_in_seconds: i64 },
    DailyLimitExceeded { limit: i32, reset_in_seconds: i64 },
}

/// 速率限制服务
/// 负责基于系统设置实施速率限制
pub struct RateLimitService {
    settings_service: SharedSettingsService,
    // key -> (API Key ID, 记录)
    records: Arc<RwLock<HashMap<String, RateLimitRecord>>>,
}

impl RateLimitService {
    /// 创建新的速率限制服务
    pub fn new(settings_service: SharedSettingsService) -> Self {
        Self {
            settings_service,
            records: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 检查并更新速率限制
    pub async fn check_rate_limit(&self, api_key_id: i64) -> RateLimitResult {
        let key = api_key_id.to_string();
        let now = Utc::now();
        
        // 获取设置中的限制值
        let minute_limit = self.settings_service.get_rate_limit_per_minute().await;
        let daily_limit = self.settings_service.get_max_requests_per_day().await;

        let mut records = self.records.write().await;
        let record = records.entry(key).or_default();

        // 检查分钟窗口
        let minute_window_start = now - Duration::minutes(1);
        if record.window_start < minute_window_start {
            // 重置分钟计数器
            record.count = 0;
            record.window_start = now;
        }

        // 检查日窗口
        let daily_window_start = now.date_naive().and_hms_opt(0, 0, 0).unwrap().and_utc();
        if record.daily_start < daily_window_start {
            // 重置日计数器
            record.daily_count = 0;
            record.daily_start = daily_window_start;
        }

        // 检查分钟限制
        if record.count >= minute_limit as u32 {
            let reset_in_seconds = 60 - (now - record.window_start).num_seconds();
            warn!("⚠️ API密钥 {} 分钟限流: {}/{}", api_key_id, record.count, minute_limit);
            return RateLimitResult::MinuteLimitExceeded { 
                limit: minute_limit, 
                reset_in_seconds 
            };
        }

        // 检查日限制
        if record.daily_count >= daily_limit as u32 {
            let tomorrow = daily_window_start + Duration::days(1);
            let reset_in_seconds = (tomorrow - now).num_seconds();
            warn!("⚠️ API密钥 {} 日限流: {}/{}", api_key_id, record.daily_count, daily_limit);
            return RateLimitResult::DailyLimitExceeded { 
                limit: daily_limit, 
                reset_in_seconds 
            };
        }

        // 增加计数器
        record.count += 1;
        record.daily_count += 1;

        info!("✅ API密钥 {} 速率检查通过: 分钟 {}/{}, 日 {}/{}", 
            api_key_id, record.count, minute_limit, record.daily_count, daily_limit);

        RateLimitResult::Allowed
    }

    /// 清理过期记录（定期调用）
    pub async fn cleanup_expired_records(&self) {
        let now = Utc::now();
        let cutoff = now - Duration::hours(25); // 保留超过1天的记录用于日限制

        let mut records = self.records.write().await;
        records.retain(|_, record| {
            record.window_start > cutoff || record.daily_start > cutoff
        });

        info!("🧹 清理速率限制记录，当前记录数: {}", records.len());
    }
}

/// 全局速率限制服务实例
pub type SharedRateLimitService = Arc<RateLimitService>;