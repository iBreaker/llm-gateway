use sqlx::{PgPool, postgres::PgPoolOptions, Row};
use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use crate::infrastructure::config::DatabaseConfig;

/// 数据库连接池统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolStats {
    pub size: u32,
    pub idle: u32, 
    pub active: u32,
    pub total_connections: u64,
    pub failed_connections: u64,
    pub average_acquire_time_ms: f64,
    pub max_acquire_time_ms: u64,
    pub last_health_check: chrono::DateTime<chrono::Utc>,
    pub health_check_success: bool,
}

/// 数据库连接错误类型
#[derive(Debug, thiserror::Error)]
pub enum DatabaseConnectionError {
    #[error("连接池配置错误: {0}")]
    Configuration(String),
    
    #[error("数据库连接失败: {0}")]
    Connection(#[from] sqlx::Error),
    
    #[error("连接池已满，无法获取连接")]
    PoolExhausted,
    
    #[error("健康检查失败: {0}")]
    HealthCheckFailed(String),
    
    #[error("连接超时: 等待时间超过 {timeout_seconds} 秒")]
    Timeout { timeout_seconds: u64 },
}

/// 增强的数据库连接管理器
#[derive(Debug, Clone)]
pub struct DatabaseConnection {
    pool: PgPool,
    stats: Arc<RwLock<PoolStats>>,
}

impl DatabaseConnection {
    /// 创建新的数据库连接管理器
    pub async fn new(database_url: &str, config: DatabaseConfig) -> Result<Self, DatabaseConnectionError> {
        // 验证配置
        Self::validate_config(&config)?;
        
        // 构建连接池
        let pool = Self::create_pool(database_url, &config).await?;
        
        // 初始化统计信息
        let stats = Arc::new(RwLock::new(PoolStats {
            size: config.min_connections,
            idle: config.min_connections,
            active: 0,
            total_connections: 0,
            failed_connections: 0,
            average_acquire_time_ms: 0.0,
            max_acquire_time_ms: 0,
            last_health_check: chrono::Utc::now(),
            health_check_success: false,
        }));
        
        let connection = Self {
            pool,
            stats,
        };
        
        // 执行初始健康检查
        connection.health_check().await?;
        
        tracing::info!("数据库连接池初始化成功 - max: {}, min: {}", 
            config.max_connections, config.min_connections);
        
        Ok(connection)
    }
    
    /// 验证数据库配置
    fn validate_config(config: &DatabaseConfig) -> Result<(), DatabaseConnectionError> {
        if config.min_connections > config.max_connections {
            return Err(DatabaseConnectionError::Configuration(
                "最小连接数不能大于最大连接数".to_string()
            ));
        }
        
        if config.max_connections == 0 {
            return Err(DatabaseConnectionError::Configuration(
                "最大连接数必须大于0".to_string()
            ));
        }
        
        if config.acquire_timeout_seconds == 0 {
            return Err(DatabaseConnectionError::Configuration(
                "连接获取超时时间必须大于0".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// 创建连接池
    async fn create_pool(database_url: &str, config: &DatabaseConfig) -> Result<PgPool, DatabaseConnectionError> {
        let mut pool_options = PgPoolOptions::new()
            .max_connections(config.max_connections)
            .min_connections(config.min_connections)
            .acquire_timeout(Duration::from_secs(config.acquire_timeout_seconds))
            .idle_timeout(Duration::from_secs(config.idle_timeout_seconds))
            .max_lifetime(Duration::from_secs(config.max_lifetime_seconds))
            .test_before_acquire(config.test_before_acquire);
        
        // 配置SQLx日志级别
        if config.sqlx_logging {
            pool_options = pool_options.after_connect(|_conn, _meta| {
                Box::pin(async move {
                    tracing::debug!("新数据库连接已建立");
                    Ok(())
                })
            });
        }
        
        pool_options.connect(database_url).await
            .map_err(DatabaseConnectionError::Connection)
    }
    
    /// 获取数据库连接池
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
    
    /// 执行健康检查
    pub async fn health_check(&self) -> Result<bool, DatabaseConnectionError> {
        let start = Instant::now();
        
        let result = sqlx::query("SELECT 1 as health_check, version() as db_version, now() as current_time")
            .fetch_one(&self.pool)
            .await;
        
        let elapsed = start.elapsed();
        let mut stats = self.stats.write().await;
        
        match result {
            Ok(row) => {
                let _health: i32 = row.get("health_check");
                let version: String = row.get("db_version");
                let current_time: chrono::DateTime<chrono::Utc> = row.get("current_time");
                
                stats.last_health_check = chrono::Utc::now();
                stats.health_check_success = true;
                
                tracing::info!(
                    "数据库健康检查成功 - 响应时间: {:?}, 版本: {}, 服务器时间: {}", 
                    elapsed, version, current_time
                );
                Ok(true)
            }
            Err(e) => {
                stats.last_health_check = chrono::Utc::now();
                stats.health_check_success = false;
                stats.failed_connections += 1;
                
                tracing::error!("数据库健康检查失败 - 响应时间: {:?}, 错误: {:?}", elapsed, e);
                Err(DatabaseConnectionError::HealthCheckFailed(e.to_string()))
            }
        }
    }
    
    /// 获取连接池统计信息
    pub async fn get_pool_stats(&self) -> PoolStats {
        let mut stats = self.stats.write().await;
        
        // 更新实时统计信息
        stats.size = self.pool.size();
        stats.idle = self.pool.num_idle() as u32;
        
        stats.clone()
    }
    
    /// 强制关闭连接池
    pub async fn close(&self) {
        tracing::info!("正在关闭数据库连接池...");
        self.pool.close().await;
        tracing::info!("数据库连接池已关闭");
    }
    
    /// 测试连接获取性能
    pub async fn benchmark_connection_acquire(&self, iterations: u32) -> Result<Duration, DatabaseConnectionError> {
        let start = Instant::now();
        
        for i in 0..iterations {
            let acquire_start = Instant::now();
            
            match self.pool.acquire().await {
                Ok(_conn) => {
                    let acquire_time = acquire_start.elapsed();
                    tracing::debug!("连接获取 #{} 耗时: {:?}", i + 1, acquire_time);
                    
                    // 更新统计信息
                    let mut stats = self.stats.write().await;
                    stats.total_connections += 1;
                    
                    let acquire_ms = acquire_time.as_millis() as f64;
                    stats.average_acquire_time_ms = 
                        (stats.average_acquire_time_ms * (stats.total_connections - 1) as f64 + acquire_ms) 
                        / stats.total_connections as f64;
                    
                    if acquire_time.as_millis() as u64 > stats.max_acquire_time_ms {
                        stats.max_acquire_time_ms = acquire_time.as_millis() as u64;
                    }
                }
                Err(e) => {
                    let mut stats = self.stats.write().await;
                    stats.failed_connections += 1;
                    
                    tracing::warn!("连接获取 #{} 失败: {:?}", i + 1, e);
                    return Err(DatabaseConnectionError::Connection(e));
                }
            }
        }
        
        let total_time = start.elapsed();
        tracing::info!("连接获取性能测试完成 - {} 次获取，总耗时: {:?}，平均耗时: {:?}", 
            iterations, total_time, total_time / iterations);
        
        Ok(total_time)
    }
}