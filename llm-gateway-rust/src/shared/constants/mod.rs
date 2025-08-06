//! 常量定义模块

/// JWT相关常量
pub mod jwt {
    pub const JWT_SECRET_MIN_LENGTH: usize = 32;
    pub const ACCESS_TOKEN_EXPIRES_IN_SECONDS: i64 = 3600; // 1小时
    pub const REFRESH_TOKEN_EXPIRES_IN_SECONDS: i64 = 86400 * 7; // 7天
}

/// API Key相关常量
pub mod api_key {
    pub const MAX_KEYS_PER_USER: usize = 10;
    pub const KEY_LENGTH: usize = 32;
    pub const DEFAULT_EXPIRES_IN_DAYS: u32 = 90;
}

/// 分页相关常量
pub mod pagination {
    pub const DEFAULT_PAGE_SIZE: u32 = 20;
    pub const MAX_PAGE_SIZE: u32 = 100;
}

/// 健康检查相关常量
pub mod health {
    pub const HEALTH_CHECK_TIMEOUT_SECONDS: u64 = 10;
    pub const UNHEALTHY_THRESHOLD_FAILURES: u32 = 3;
    pub const DEGRADED_THRESHOLD_LATENCY_MS: u32 = 5000;
}

/// 负载均衡相关常量
pub mod load_balancer {
    pub const MAX_RETRY_ATTEMPTS: u32 = 3;
    pub const CIRCUIT_BREAKER_FAILURE_THRESHOLD: u32 = 5;
    pub const CIRCUIT_BREAKER_TIMEOUT_SECONDS: u64 = 60;
}

/// 缓存相关常量
pub mod cache {
    pub const DEFAULT_TTL_SECONDS: u64 = 300; // 5分钟
    pub const MAX_CACHE_SIZE: usize = 1000;
}

/// 速率限制相关常量
pub mod rate_limit {
    pub const DEFAULT_REQUESTS_PER_MINUTE: u32 = 60;
    pub const BURST_CAPACITY: u32 = 10;
}

/// HTTP相关常量
pub mod http {
    pub const DEFAULT_TIMEOUT_SECONDS: u64 = 30;
    pub const MAX_REQUEST_SIZE_BYTES: usize = 10 * 1024 * 1024; // 10MB
    pub const MAX_RESPONSE_SIZE_BYTES: usize = 50 * 1024 * 1024; // 50MB
}

/// 监控相关常量
pub mod monitoring {
    pub const METRICS_COLLECTION_INTERVAL_SECONDS: u64 = 60;
    pub const TRACE_SAMPLE_RATE: f64 = 0.1; // 10%采样率
}