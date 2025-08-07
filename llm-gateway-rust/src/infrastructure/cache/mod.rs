//! 缓存基础设施模块
//! 
//! 实现多层缓存策略：
//! - L1: 内存缓存 (LRU) - 路由决策、基础统计
//! - L2: Redis缓存 - 统计数据、会话信息
//! - L3: 数据库 - 持久化数据

use std::time::{Duration, Instant};
use serde::{Serialize, Deserialize};

pub mod memory_cache;
pub mod redis_cache;
pub mod cache_manager;
pub mod simple_cache;
pub mod integration_test;
pub mod invalidation_test;

// 重新导出主要类型
pub use cache_manager::{CacheManager, UserStats, AccountStats, RoutingDecision};
pub use simple_cache::SimpleCache;

/// 缓存值包装器
#[derive(Debug, Clone)]
pub struct CachedValue<T> {
    pub value: T,
    pub created_at: Instant,
    pub ttl: Duration,
}

impl<T> CachedValue<T> {
    pub fn new(value: T, ttl: Duration) -> Self {
        Self {
            value,
            created_at: Instant::now(),
            ttl,
        }
    }

    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.ttl
    }

    pub fn remaining_ttl(&self) -> Option<Duration> {
        let elapsed = self.created_at.elapsed();
        if elapsed >= self.ttl {
            None
        } else {
            Some(self.ttl - elapsed)
        }
    }
}

/// 缓存层枚举
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CacheLayer {
    Memory,
    Redis,
    Database,
}

/// 缓存策略配置
#[derive(Debug, Clone)]
pub struct CacheConfig {
    /// L1内存缓存配置
    pub memory_cache_size: usize,
    pub memory_default_ttl: Duration,
    
    /// L2 Redis配置
    pub redis_url: Option<String>,
    pub redis_default_ttl: Duration,
    pub redis_key_prefix: String,
    
    /// 缓存策略
    pub enable_memory_cache: bool,
    pub enable_redis_cache: bool,
    pub cache_miss_fallback: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            memory_cache_size: 1000,
            memory_default_ttl: Duration::from_secs(300), // 5分钟
            redis_url: None,
            redis_default_ttl: Duration::from_secs(3600), // 1小时
            redis_key_prefix: "llm-gateway:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: false, // 默认关闭，需要显式启用
            cache_miss_fallback: true,
        }
    }
}

/// 缓存操作结果
#[derive(Debug, Clone, PartialEq)]
pub enum CacheResult<T> {
    Hit(T, CacheLayer),
    Miss,
    Error(String),
}

impl<T> CacheResult<T> {
    pub fn is_hit(&self) -> bool {
        matches!(self, CacheResult::Hit(_, _))
    }

    pub fn is_miss(&self) -> bool {
        matches!(self, CacheResult::Miss)
    }

    pub fn is_error(&self) -> bool {
        matches!(self, CacheResult::Error(_))
    }

    pub fn unwrap_or_else<F>(self, fallback: F) -> T 
    where 
        F: FnOnce() -> T 
    {
        match self {
            CacheResult::Hit(value, _) => value,
            _ => fallback(),
        }
    }
}

/// TTL配置类别
#[derive(Debug, Clone, Copy)]
pub enum CacheTtlProfile {
    /// 短期缓存 - 30秒到5分钟
    ShortTerm,
    /// 中期缓存 - 15分钟到1小时  
    MediumTerm,
    /// 长期缓存 - 1小时到24小时
    LongTerm,
    /// 自定义TTL
    Custom(Duration),
}

impl CacheTtlProfile {
    pub fn memory_ttl(&self) -> Duration {
        match self {
            CacheTtlProfile::ShortTerm => Duration::from_secs(30),
            CacheTtlProfile::MediumTerm => Duration::from_secs(300),  // 5分钟
            CacheTtlProfile::LongTerm => Duration::from_secs(900),    // 15分钟
            CacheTtlProfile::Custom(duration) => *duration,
        }
    }

    pub fn redis_ttl(&self) -> Duration {
        match self {
            CacheTtlProfile::ShortTerm => Duration::from_secs(300),   // 5分钟
            CacheTtlProfile::MediumTerm => Duration::from_secs(1800), // 30分钟
            CacheTtlProfile::LongTerm => Duration::from_secs(3600),   // 1小时
            CacheTtlProfile::Custom(duration) => *duration,
        }
    }
}

/// 缓存键构建器
#[derive(Debug, Clone)]
pub struct CacheKeyBuilder {
    prefix: String,
}

impl CacheKeyBuilder {
    pub fn new(prefix: &str) -> Self {
        Self {
            prefix: prefix.to_string(),
        }
    }

    /// 用户统计缓存键
    pub fn user_stats_key(&self, user_id: i64, time_range: &str) -> String {
        format!("{}stats:user:{}:{}", self.prefix, user_id, time_range)
    }

    /// 账号统计缓存键
    pub fn account_stats_key(&self, account_id: i64) -> String {
        format!("{}stats:account:{}", self.prefix, account_id)
    }

    /// 路由决策缓存键
    pub fn routing_decision_key(&self, api_key_hash: &str, model: &str) -> String {
        format!("{}routing:{}:{}", self.prefix, api_key_hash, model)
    }

    /// 健康检查缓存键
    pub fn health_check_key(&self, account_id: i64) -> String {
        format!("{}health:{}", self.prefix, account_id)
    }

    /// API配额缓存键
    pub fn quota_key(&self, api_key_id: i64, window: &str) -> String {
        format!("{}quota:{}:{}", self.prefix, api_key_id, window)
    }
}

/// 缓存事件
#[derive(Debug, Clone)]
pub enum CacheEvent {
    Hit { key: String, layer: CacheLayer, ttl: Option<Duration> },
    Miss { key: String },
    Set { key: String, layer: CacheLayer, ttl: Duration },
    Evict { key: String, layer: CacheLayer },
    Error { key: String, error: String },
}

/// 缓存指标统计
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CacheMetrics {
    pub memory_hits: u64,
    pub memory_misses: u64,
    pub memory_evictions: u64,
    pub redis_hits: u64,
    pub redis_misses: u64,
    pub redis_errors: u64,
    pub total_requests: u64,
}

impl CacheMetrics {
    pub fn memory_hit_rate(&self) -> f64 {
        if self.memory_hits + self.memory_misses == 0 {
            0.0
        } else {
            self.memory_hits as f64 / (self.memory_hits + self.memory_misses) as f64
        }
    }

    pub fn redis_hit_rate(&self) -> f64 {
        if self.redis_hits + self.redis_misses == 0 {
            0.0
        } else {
            self.redis_hits as f64 / (self.redis_hits + self.redis_misses) as f64
        }
    }

    pub fn overall_hit_rate(&self) -> f64 {
        let total_hits = self.memory_hits + self.redis_hits;
        let total_requests = self.total_requests;
        if total_requests == 0 {
            0.0
        } else {
            total_hits as f64 / total_requests as f64
        }
    }
}