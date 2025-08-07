//! 缓存管理器
//! 
//! 统一管理多层缓存系统，实现智能缓存策略
//! 缓存层级：L1(内存) -> L2(Redis) -> L3(数据库)

use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};
use tracing::{debug, info, warn};

use crate::shared::AppResult;

use super::{
    CacheConfig, CacheResult, CacheLayer, CacheTtlProfile, CacheKeyBuilder,
    CacheMetrics,
    memory_cache::{SharedMemoryCache, CacheStats as MemoryCacheStats},
    redis_cache::{RedisCache, RedisInfo},
};

/// 统计数据类型定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStats {
    pub user_id: i64,
    pub total_requests: i64,
    pub successful_requests: i64,
    pub total_cost: f64,
    pub avg_response_time: f64,
    pub last_request_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountStats {
    pub account_id: i64,
    pub request_count: i64,
    pub success_rate: f64,
    pub avg_response_time: f64,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutingDecision {
    pub account_id: i64,
    pub routing_weight: f32,
    pub estimated_response_time: u64,
    pub decided_at: chrono::DateTime<chrono::Utc>,
}

/// 多层缓存管理器
#[derive(Debug, Clone)]
pub struct CacheManager {
    config: CacheConfig,
    key_builder: CacheKeyBuilder,
    
    // L1: 内存缓存
    memory_cache_stats: SharedMemoryCache<String, UserStats>,
    memory_cache_routing: SharedMemoryCache<String, RoutingDecision>,
    memory_cache_health: SharedMemoryCache<i64, bool>,
    
    // L2: Redis缓存
    redis_cache: Option<RedisCache>,
    
    // 缓存指标
    metrics: Arc<RwLock<CacheMetrics>>,
}

impl CacheManager {
    /// 创建新的缓存管理器
    pub async fn new(config: CacheConfig) -> AppResult<Self> {
        let key_builder = CacheKeyBuilder::new(&config.redis_key_prefix);
        
        // 初始化内存缓存
        let memory_cache_stats = SharedMemoryCache::new(
            config.memory_cache_size,
            config.memory_default_ttl,
        );
        
        let memory_cache_routing = SharedMemoryCache::new(
            config.memory_cache_size / 2, // 路由决策缓存较小
            Duration::from_secs(60),       // 较短的TTL
        );
        
        let memory_cache_health = SharedMemoryCache::new(
            config.memory_cache_size / 4, // 健康状态缓存最小
            Duration::from_secs(30),       // 最短的TTL
        );
        
        // 初始化Redis缓存
        let redis_cache = if config.enable_redis_cache {
            if let Some(ref redis_url) = config.redis_url {
                match RedisCache::new(
                    redis_url,
                    config.redis_key_prefix.clone(),
                    config.redis_default_ttl,
                    10, // 连接池大小
                ) {
                    Ok(cache) => {
                        // 测试连接
                        if let Err(e) = cache.ping().await {
                            warn!("Redis连接测试失败，禁用Redis缓存: {}", e);
                            None
                        } else {
                            info!("Redis缓存已启用: {}", redis_url);
                            Some(cache)
                        }
                    }
                    Err(e) => {
                        warn!("Redis缓存初始化失败，禁用Redis缓存: {}", e);
                        None
                    }
                }
            } else {
                warn!("未配置Redis URL，禁用Redis缓存");
                None
            }
        } else {
            debug!("Redis缓存已在配置中禁用");
            None
        };
        
        Ok(Self {
            config,
            key_builder,
            memory_cache_stats,
            memory_cache_routing,
            memory_cache_health,
            redis_cache,
            metrics: Arc::new(RwLock::new(CacheMetrics::default())),
        })
    }

    /// 获取用户统计数据
    pub async fn get_user_stats(&self, user_id: i64, time_range: &str) -> AppResult<Option<UserStats>> {
        let key = self.key_builder.user_stats_key(user_id, time_range);
        
        // L1: 检查内存缓存
        if self.config.enable_memory_cache {
            let result = self.memory_cache_stats.get(&key).await;
            if let CacheResult::Hit(stats, _) = result {
                self.record_cache_hit(CacheLayer::Memory).await;
                debug!("用户统计缓存命中 L1: user_id={}, range={}", user_id, time_range);
                return Ok(Some(stats));
            }
        }

        // L2: 检查Redis缓存
        if let Some(ref redis) = self.redis_cache {
            let result = redis.get::<UserStats>(&key).await;
            if let CacheResult::Hit(stats, _) = result {
                self.record_cache_hit(CacheLayer::Redis).await;
                
                // 回填到L1缓存
                if self.config.enable_memory_cache {
                    let _ = self.memory_cache_stats.set(
                        key.clone(),
                        stats.clone(),
                        Some(CacheTtlProfile::ShortTerm.memory_ttl()),
                    ).await;
                }
                
                debug!("用户统计缓存命中 L2: user_id={}, range={}", user_id, time_range);
                return Ok(Some(stats));
            }
        }

        self.record_cache_miss().await;
        debug!("用户统计缓存未命中: user_id={}, range={}", user_id, time_range);
        Ok(None)
    }

    /// 缓存用户统计数据
    pub async fn set_user_stats(&self, user_id: i64, time_range: &str, stats: UserStats) -> AppResult<()> {
        let key = self.key_builder.user_stats_key(user_id, time_range);
        
        // L1: 设置内存缓存
        if self.config.enable_memory_cache {
            if let Err(e) = self.memory_cache_stats.set(
                key.clone(),
                stats.clone(),
                Some(CacheTtlProfile::MediumTerm.memory_ttl()),
            ).await {
                warn!("设置L1缓存失败: key={}, error={}", key, e);
            }
        }

        // L2: 设置Redis缓存
        if let Some(ref redis) = self.redis_cache {
            if let Err(e) = redis.set(
                &key,
                &stats,
                Some(CacheTtlProfile::MediumTerm.redis_ttl()),
            ).await {
                warn!("设置L2缓存失败: key={}, error={}", key, e);
            }
        }

        debug!("用户统计已缓存: user_id={}, range={}", user_id, time_range);
        Ok(())
    }

    /// 获取账号统计数据
    pub async fn get_account_stats(&self, account_id: i64) -> AppResult<Option<AccountStats>> {
        let key = self.key_builder.account_stats_key(account_id);
        
        // L1: 检查内存缓存（这里使用路由缓存存储，因为AccountStats相对简单）
        // 注意：实际项目中可能需要为AccountStats创建专门的内存缓存
        
        // L2: 检查Redis缓存
        if let Some(ref redis) = self.redis_cache {
            let result = redis.get::<AccountStats>(&key).await;
            if let CacheResult::Hit(stats, _) = result {
                self.record_cache_hit(CacheLayer::Redis).await;
                debug!("账号统计缓存命中: account_id={}", account_id);
                return Ok(Some(stats));
            }
        }

        self.record_cache_miss().await;
        debug!("账号统计缓存未命中: account_id={}", account_id);
        Ok(None)
    }

    /// 缓存账号统计数据
    pub async fn set_account_stats(&self, account_id: i64, stats: AccountStats) -> AppResult<()> {
        let key = self.key_builder.account_stats_key(account_id);
        
        // L2: 设置Redis缓存（账号统计主要放在Redis中）
        if let Some(ref redis) = self.redis_cache {
            if let Err(e) = redis.set(
                &key,
                &stats,
                Some(CacheTtlProfile::LongTerm.redis_ttl()),
            ).await {
                warn!("设置账号统计缓存失败: key={}, error={}", key, e);
            }
        }

        debug!("账号统计已缓存: account_id={}", account_id);
        Ok(())
    }

    /// 获取路由决策缓存
    pub async fn get_routing_decision(&self, api_key_hash: &str, model: &str) -> AppResult<Option<RoutingDecision>> {
        let key = self.key_builder.routing_decision_key(api_key_hash, model);
        
        // L1: 检查内存缓存（路由决策主要使用L1缓存，因为需要极快的响应）
        if self.config.enable_memory_cache {
            let result = self.memory_cache_routing.get(&key).await;
            if let CacheResult::Hit(decision, _) = result {
                self.record_cache_hit(CacheLayer::Memory).await;
                debug!("路由决策缓存命中: api_key_hash={}, model={}", api_key_hash, model);
                return Ok(Some(decision));
            }
        }

        self.record_cache_miss().await;
        debug!("路由决策缓存未命中: api_key_hash={}, model={}", api_key_hash, model);
        Ok(None)
    }

    /// 缓存路由决策
    pub async fn set_routing_decision(&self, api_key_hash: &str, model: &str, decision: RoutingDecision) -> AppResult<()> {
        let key = self.key_builder.routing_decision_key(api_key_hash, model);
        
        // L1: 设置内存缓存（路由决策TTL较短）
        if self.config.enable_memory_cache {
            if let Err(e) = self.memory_cache_routing.set(
                key.clone(),
                decision,
                Some(Duration::from_secs(60)), // 1分钟TTL
            ).await {
                warn!("设置路由决策缓存失败: key={}, error={}", key, e);
            }
        }

        debug!("路由决策已缓存: api_key_hash={}, model={}", api_key_hash, model);
        Ok(())
    }

    /// 获取账号健康状态
    pub async fn get_account_health(&self, account_id: i64) -> AppResult<Option<bool>> {
        let key = account_id;
        
        // L1: 检查内存缓存（健康状态使用专门的缓存）
        if self.config.enable_memory_cache {
            let result = self.memory_cache_health.get(&key).await;
            if let CacheResult::Hit(is_healthy, _) = result {
                self.record_cache_hit(CacheLayer::Memory).await;
                debug!("账号健康状态缓存命中: account_id={}", account_id);
                return Ok(Some(is_healthy));
            }
        }

        self.record_cache_miss().await;
        debug!("账号健康状态缓存未命中: account_id={}", account_id);
        Ok(None)
    }

    /// 缓存账号健康状态
    pub async fn set_account_health(&self, account_id: i64, is_healthy: bool) -> AppResult<()> {
        let key = account_id;
        
        // L1: 设置内存缓存（健康状态TTL很短）
        if self.config.enable_memory_cache {
            if let Err(e) = self.memory_cache_health.set(
                key,
                is_healthy,
                Some(Duration::from_secs(30)), // 30秒TTL
            ).await {
                warn!("设置账号健康状态缓存失败: account_id={}, error={}", account_id, e);
            }
        }

        debug!("账号健康状态已缓存: account_id={}, is_healthy={}", account_id, is_healthy);
        Ok(())
    }

    /// 失效用户相关缓存
    pub async fn invalidate_user_cache(&self, user_id: i64) -> AppResult<()> {
        // 失效Redis中的用户相关缓存
        if let Some(ref redis) = self.redis_cache {
            let pattern = format!("stats:user:{}:*", user_id);
            match redis.delete_pattern(&pattern).await {
                Ok(deleted_count) => {
                    info!("用户缓存失效完成: user_id={}, deleted={}", user_id, deleted_count);
                }
                Err(e) => {
                    warn!("用户缓存失效失败: user_id={}, error={}", user_id, e);
                }
            }
        }

        Ok(())
    }

    /// 失效账号相关缓存
    pub async fn invalidate_account_cache(&self, account_id: i64) -> AppResult<()> {
        // 失效内存中的健康状态缓存
        if self.config.enable_memory_cache {
            self.memory_cache_health.remove(&account_id).await;
        }

        // 失效Redis中的账号统计缓存
        if let Some(ref redis) = self.redis_cache {
            let key = self.key_builder.account_stats_key(account_id);
            let _ = redis.delete(&key).await;
        }

        debug!("账号缓存失效完成: account_id={}", account_id);
        Ok(())
    }

    /// 清空所有缓存
    pub async fn clear_all_caches(&self) -> AppResult<()> {
        // 清空内存缓存
        if self.config.enable_memory_cache {
            self.memory_cache_stats.clear().await;
            self.memory_cache_routing.clear().await;
            self.memory_cache_health.clear().await;
        }

        // 清空Redis缓存
        if let Some(ref redis) = self.redis_cache {
            let _ = redis.delete_pattern("*").await;
        }

        info!("所有缓存已清空");
        Ok(())
    }

    /// 获取缓存统计信息
    pub async fn get_cache_stats(&self) -> AppResult<CacheManagerStats> {
        let memory_stats = if self.config.enable_memory_cache {
            Some(CacheManagerMemoryStats {
                stats_cache: self.memory_cache_stats.stats().await,
                routing_cache: self.memory_cache_routing.stats().await,
                health_cache: self.memory_cache_health.stats().await,
            })
        } else {
            None
        };

        let redis_stats = if let Some(ref redis) = self.redis_cache {
            redis.info().await.ok()
        } else {
            None
        };

        let metrics = {
            let guard = self.metrics.read().await;
            guard.clone()
        };

        Ok(CacheManagerStats {
            memory_stats,
            redis_stats,
            metrics,
            redis_enabled: self.redis_cache.is_some(),
            memory_enabled: self.config.enable_memory_cache,
        })
    }

    /// 记录缓存命中
    async fn record_cache_hit(&self, layer: CacheLayer) {
        let mut metrics = self.metrics.write().await;
        metrics.total_requests += 1;
        
        match layer {
            CacheLayer::Memory => metrics.memory_hits += 1,
            CacheLayer::Redis => metrics.redis_hits += 1,
            CacheLayer::Database => {}, // 数据库不算缓存命中
        }
    }

    /// 记录缓存未命中
    async fn record_cache_miss(&self) {
        let mut metrics = self.metrics.write().await;
        metrics.total_requests += 1;
        // 未命中不需要特别记录，因为可以通过总请求数 - 命中数计算
    }
}

/// 缓存管理器统计信息
#[derive(Debug, Serialize, Deserialize)]
pub struct CacheManagerStats {
    pub memory_stats: Option<CacheManagerMemoryStats>,
    pub redis_stats: Option<RedisInfo>,
    pub metrics: CacheMetrics,
    pub redis_enabled: bool,
    pub memory_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CacheManagerMemoryStats {
    pub stats_cache: MemoryCacheStats,
    pub routing_cache: MemoryCacheStats,
    pub health_cache: MemoryCacheStats,
}