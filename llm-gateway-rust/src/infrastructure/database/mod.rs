pub mod connection;
pub mod accounts_repository;

use std::time::Duration;
use sqlx::{PgPool, Row};
use crate::infrastructure::config::{Config, DatabaseConfig};
use crate::infrastructure::cache::{CacheConfig as CacheManagerConfig, CacheManager, SimpleCache};
use connection::{DatabaseConnection, DatabaseConnectionError, PoolStats};
pub use accounts_repository::AccountsRepository;

/// 数据库错误类型
#[derive(Debug, thiserror::Error)]
pub enum DatabaseError {
    #[error("连接管理器错误: {0}")]
    ConnectionManager(#[from] DatabaseConnectionError),
    
    #[error("SQL执行错误: {0}")]
    Sql(#[from] sqlx::Error),
    
    #[error("配置错误: {0}")]
    #[allow(dead_code)]
    Configuration(String),
}

/// 数据库管理器 - 包装连接管理器并提供业务逻辑
#[derive(Debug, Clone)]
pub struct Database {
    connection_manager: DatabaseConnection,
    pub accounts: AccountsRepository,
    pub cache_manager: Option<CacheManager>,
}

impl Database {
    /// 使用配置创建数据库实例
    pub async fn new(config: &Config) -> Result<Self, DatabaseError> {
        let connection_manager = DatabaseConnection::new(
            &config.database_url, 
            config.database.clone()
        ).await?;

        // 初始化缓存管理器
        let cache_manager = Self::create_cache_manager(&config.cache).await.ok();
        
        // 创建SimpleCache用于repository
        let simple_cache = if config.cache.enable_memory_cache {
            Some(SimpleCache::new(config.cache.memory_cache_size))
        } else {
            None
        };

        let accounts = if let Some(ref cache) = simple_cache {
            AccountsRepository::with_cache(connection_manager.pool().clone(), cache.clone())
        } else {
            AccountsRepository::new(connection_manager.pool().clone())
        };

        Ok(Database { connection_manager, accounts, cache_manager })
    }

    /// 传统方式创建数据库实例（向后兼容）
    pub async fn new_simple(database_url: &str) -> Result<Self, DatabaseError> {
        let default_config = DatabaseConfig {
            max_connections: 20,
            min_connections: 5,
            acquire_timeout_seconds: 30,
            idle_timeout_seconds: 600,
            max_lifetime_seconds: 1800,
            test_before_acquire: true,
            sqlx_logging: false,
        };

        let connection_manager = DatabaseConnection::new(database_url, default_config).await?;
        let accounts = AccountsRepository::new(connection_manager.pool().clone());

        Ok(Database { connection_manager, accounts, cache_manager: None })
    }

    /// 获取数据库连接池
    pub fn pool(&self) -> &PgPool {
        self.connection_manager.pool()
    }

    /// 执行健康检查
    pub async fn health_check(&self) -> Result<bool, DatabaseError> {
        self.connection_manager.health_check().await
            .map_err(DatabaseError::ConnectionManager)
    }

    /// 获取连接池统计信息
    pub async fn get_pool_stats(&self) -> PoolStats {
        self.connection_manager.get_pool_stats().await
    }

    /// 测试数据库连接性能
    pub async fn benchmark_connections(&self, iterations: u32) -> Result<std::time::Duration, DatabaseError> {
        self.connection_manager.benchmark_connection_acquire(iterations).await
            .map_err(DatabaseError::ConnectionManager)
    }

    /// 强制关闭数据库连接
    pub async fn close(&self) {
        self.connection_manager.close().await;
    }

    /// 执行数据库迁移检查
    pub async fn check_migrations(&self) -> Result<bool, DatabaseError> {
        let result = sqlx::query(
            "SELECT COUNT(*) as migration_count FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'users'"
        )
        .fetch_one(self.pool())
        .await?;

        let count: i64 = result.get("migration_count");
        Ok(count > 0)
    }

    /// 获取数据库版本信息
    pub async fn get_version_info(&self) -> Result<DatabaseVersionInfo, DatabaseError> {
        let result = sqlx::query(
            "SELECT version() as version, 
                    current_database() as database_name,
                    current_user as username,
                    inet_server_addr() as server_addr,
                    inet_server_port() as server_port"
        )
        .fetch_one(self.pool())
        .await?;

        Ok(DatabaseVersionInfo {
            version: result.get("version"),
            database_name: result.get("database_name"),
            username: result.get("username"),
            server_addr: result.try_get::<String, _>("server_addr").ok()
                .and_then(|s| s.parse().ok()),
            server_port: result.try_get::<i32, _>("server_port").ok(),
        })
    }

    /// 创建缓存管理器的私有方法
    async fn create_cache_manager(cache_config: &crate::infrastructure::config::CacheConfig) -> Result<CacheManager, DatabaseError> {
        // 将配置结构转换为缓存模块的CacheConfig
        let cache_manager_config = CacheManagerConfig {
            memory_cache_size: cache_config.memory_cache_size,
            memory_default_ttl: Duration::from_secs(cache_config.default_ttl_seconds),
            redis_url: cache_config.redis_url.clone(),
            redis_default_ttl: Duration::from_secs(cache_config.default_ttl_seconds * 2), // Redis TTL更长
            redis_key_prefix: cache_config.redis_prefix.clone(),
            enable_memory_cache: cache_config.enable_memory_cache,
            enable_redis_cache: cache_config.enable_redis_cache,
            cache_miss_fallback: true,
        };

        CacheManager::new(cache_manager_config)
            .await
            .map_err(|e| DatabaseError::Configuration(format!("缓存管理器初始化失败: {}", e)))
    }

    /// 获取缓存管理器
    pub fn cache_manager(&self) -> Option<&CacheManager> {
        self.cache_manager.as_ref()
    }

    /// 为缓存管理器设置设置服务引用（用于动态配置）
    pub fn set_cache_settings_service(&mut self, settings_service: crate::business::services::SharedSettingsService) {
        if let Some(ref mut cache_manager) = self.cache_manager {
            cache_manager.set_settings_service(settings_service);
        }
    }

    /// 失效用户相关的所有缓存
    pub async fn invalidate_user_cache(&self, user_id: i64) -> Result<(), DatabaseError> {
        if let Some(ref cache_manager) = self.cache_manager {
            cache_manager.invalidate_user_cache(user_id).await
                .map_err(|e| DatabaseError::Configuration(format!("缓存失效失败: {}", e)))?;
        }
        Ok(())
    }

    /// 失效账号相关的所有缓存
    pub async fn invalidate_account_cache(&self, account_id: i64) -> Result<(), DatabaseError> {
        if let Some(ref cache_manager) = self.cache_manager {
            cache_manager.invalidate_account_cache(account_id).await
                .map_err(|e| DatabaseError::Configuration(format!("缓存失效失败: {}", e)))?;
        }
        Ok(())
    }

    /// 清空所有缓存
    pub async fn clear_all_caches(&self) -> Result<(), DatabaseError> {
        if let Some(ref cache_manager) = self.cache_manager {
            cache_manager.clear_all_caches().await
                .map_err(|e| DatabaseError::Configuration(format!("清空缓存失败: {}", e)))?;
        }
        Ok(())
    }

    /// 根据设置重新配置缓存
    pub async fn reconfigure_cache(&mut self, settings_service: &crate::business::services::SharedSettingsService) -> Result<(), DatabaseError> {
        if let Some(ref mut cache_manager) = self.cache_manager {
            // 使用动态更新方法，更高效
            cache_manager.update_config_from_settings(settings_service).await
                .map_err(|e| DatabaseError::Configuration(format!("缓存配置更新失败: {}", e)))?;
        } else {
            // 如果缓存管理器不存在，尝试创建一个新的
            let new_cache_config = crate::infrastructure::config::CacheConfig::from_settings(settings_service).await;
            self.cache_manager = Self::create_cache_manager(&new_cache_config).await.ok();
        }
        
        Ok(())
    }
}

/// 数据库版本信息
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct DatabaseVersionInfo {
    pub version: String,
    pub database_name: String,
    pub username: String,
    pub server_addr: Option<std::net::IpAddr>,
    pub server_port: Option<i32>,
}