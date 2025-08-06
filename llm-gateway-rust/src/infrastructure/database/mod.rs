pub mod connection;
pub mod accounts_repository;

use sqlx::{PgPool, Row};
use crate::infrastructure::config::{Config, DatabaseConfig};
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
}

impl Database {
    /// 使用配置创建数据库实例
    pub async fn new(config: &Config) -> Result<Self, DatabaseError> {
        let connection_manager = DatabaseConnection::new(
            &config.database_url, 
            config.database.clone()
        ).await?;

        let accounts = AccountsRepository::new(connection_manager.pool().clone());

        Ok(Database { connection_manager, accounts })
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

        Ok(Database { connection_manager, accounts })
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