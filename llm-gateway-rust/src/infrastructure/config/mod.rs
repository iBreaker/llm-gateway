use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub database_url: String,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub anthropic: AnthropicConfig,
    pub auth: AuthConfig,
    pub cache: CacheConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicConfig {
    pub base_url: String,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout_seconds: u64,
    pub idle_timeout_seconds: u64,
    pub max_lifetime_seconds: u64,
    pub test_before_acquire: bool,
    pub sqlx_logging: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub token_expiry_hours: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub redis_url: Option<String>,
    pub redis_prefix: String,
    pub memory_cache_size: usize,
    pub enable_memory_cache: bool,
    pub enable_redis_cache: bool,
    pub default_ttl_seconds: u64,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        // 从环境变量加载配置
        dotenv::dotenv().ok();

        let config = Config {
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgresql://localhost/llm_gateway".to_string()),
            
            server: ServerConfig {
                port: env::var("PORT")
                    .unwrap_or_else(|_| "9527".to_string())
                    .parse()
                    .unwrap_or(9527),
                host: env::var("HOST")
                    .unwrap_or_else(|_| "0.0.0.0".to_string()),
            },
            
            database: DatabaseConfig {
                max_connections: env::var("DB_MAX_CONNECTIONS")
                    .unwrap_or_else(|_| "20".to_string())
                    .parse()
                    .unwrap_or(20),
                min_connections: env::var("DB_MIN_CONNECTIONS")
                    .unwrap_or_else(|_| "5".to_string())
                    .parse()
                    .unwrap_or(5),
                acquire_timeout_seconds: env::var("DB_ACQUIRE_TIMEOUT")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()
                    .unwrap_or(30),
                idle_timeout_seconds: env::var("DB_IDLE_TIMEOUT")
                    .unwrap_or_else(|_| "600".to_string())
                    .parse()
                    .unwrap_or(600),
                max_lifetime_seconds: env::var("DB_MAX_LIFETIME")
                    .unwrap_or_else(|_| "1800".to_string())
                    .parse()
                    .unwrap_or(1800),
                test_before_acquire: env::var("DB_TEST_BEFORE_ACQUIRE")
                    .unwrap_or_else(|_| "true".to_string())
                    .parse()
                    .unwrap_or(true),
                sqlx_logging: env::var("DB_SQLX_LOGGING")
                    .unwrap_or_else(|_| "false".to_string())
                    .parse()
                    .unwrap_or(false),
            },
            
            anthropic: AnthropicConfig {
                base_url: env::var("ANTHROPIC_BASE_URL")
                    .unwrap_or_else(|_| "https://api.anthropic.com".to_string()),
                timeout_seconds: env::var("ANTHROPIC_TIMEOUT")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()
                    .unwrap_or(30),
            },
            
            auth: AuthConfig {
                jwt_secret: env::var("JWT_SECRET")
                    .unwrap_or_else(|_| "your-super-secret-jwt-key".to_string()),
                token_expiry_hours: env::var("TOKEN_EXPIRY_HOURS")
                    .unwrap_or_else(|_| "24".to_string())
                    .parse()
                    .unwrap_or(24),
            },
            
            cache: CacheConfig::load_default(),
        };

        Ok(config)
    }
}

impl CacheConfig {
    /// 加载默认的缓存配置（从环境变量）
    pub fn load_default() -> Self {
        Self {
            redis_url: env::var("REDIS_URL")
                .ok()
                .or_else(|| Some("redis://localhost:16379".to_string())),
            redis_prefix: env::var("CACHE_PREFIX")
                .unwrap_or_else(|_| "llm-gateway:".to_string()),
            memory_cache_size: env::var("MEMORY_CACHE_SIZE")
                .unwrap_or_else(|_| "1000".to_string())
                .parse()
                .unwrap_or(1000),
            enable_memory_cache: env::var("ENABLE_MEMORY_CACHE")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            enable_redis_cache: env::var("ENABLE_REDIS_CACHE")
                .unwrap_or_else(|_| "true".to_string())
                .parse()
                .unwrap_or(true),
            default_ttl_seconds: env::var("CACHE_DEFAULT_TTL")
                .unwrap_or_else(|_| "300".to_string())
                .parse()
                .unwrap_or(300),
        }
    }

    /// 从设置服务创建缓存配置
    pub async fn from_settings(settings: &crate::business::services::SharedSettingsService) -> Self {
        let enable_cache = settings.is_cache_enabled().await;
        let ttl_minutes = settings.get_cache_ttl_minutes().await;
        
        Self {
            redis_url: env::var("REDIS_URL")
                .ok()
                .or_else(|| Some("redis://localhost:16379".to_string())),
            redis_prefix: env::var("CACHE_PREFIX")
                .unwrap_or_else(|_| "llm-gateway:".to_string()),
            memory_cache_size: env::var("MEMORY_CACHE_SIZE")
                .unwrap_or_else(|_| "1000".to_string())
                .parse()
                .unwrap_or(1000),
            enable_memory_cache: enable_cache,
            enable_redis_cache: enable_cache,
            default_ttl_seconds: (ttl_minutes * 60) as u64, // 转换为秒
        }
    }
}