//! 缓存集成测试
//! 
//! 测试缓存系统的完整功能

#[cfg(test)]
mod tests {
    use super::super::{CacheConfig, CacheManager, SimpleCache, AccountStats};
    use std::time::Duration;

    #[tokio::test]
    async fn test_cache_manager_basic_operations() {
        let config = CacheConfig {
            memory_cache_size: 100,
            memory_default_ttl: Duration::from_secs(60),
            redis_url: None, // 测试时不使用Redis
            redis_default_ttl: Duration::from_secs(300),
            redis_key_prefix: "test:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: false,
            cache_miss_fallback: true,
        };

        let cache_manager = CacheManager::new(config).await.unwrap();

        // 测试账号健康状态缓存
        let account_id = 1i64;
        
        // 设置健康状态
        cache_manager.set_account_health(account_id, true).await.unwrap();
        
        // 获取健康状态
        let health = cache_manager.get_account_health(account_id).await.unwrap();
        assert_eq!(health, Some(true));

        // 测试缓存失效
        cache_manager.invalidate_account_cache(account_id).await.unwrap();
        let health_after_invalidate = cache_manager.get_account_health(account_id).await.unwrap();
        assert_eq!(health_after_invalidate, None);
    }

    #[tokio::test]
    async fn test_simple_cache_operations() {
        let cache = SimpleCache::new(100);

        let account_id = 1i64;
        let stats = AccountStats {
            account_id,
            request_count: 100,
            success_rate: 95.5,
            avg_response_time: 250.0,
            last_used_at: Some(chrono::Utc::now()),
        };

        // 测试设置和获取
        cache.set_account_stats(account_id, stats.clone(), Duration::from_secs(60)).await;
        let retrieved = cache.get_account_stats(account_id).await;
        
        assert!(retrieved.is_some());
        let retrieved_stats = retrieved.unwrap();
        assert_eq!(retrieved_stats.account_id, stats.account_id);
        assert_eq!(retrieved_stats.request_count, stats.request_count);
        assert_eq!(retrieved_stats.success_rate, stats.success_rate);
    }

    #[tokio::test]
    async fn test_cache_ttl_expiration() {
        let cache = SimpleCache::new(100);
        let account_id = 1i64;
        let stats = AccountStats {
            account_id,
            request_count: 50,
            success_rate: 90.0,
            avg_response_time: 300.0,
            last_used_at: None,
        };

        // 设置很短的TTL
        cache.set_account_stats(account_id, stats, Duration::from_millis(50)).await;
        
        // 立即获取应该能成功
        let result1 = cache.get_account_stats(account_id).await;
        assert!(result1.is_some());

        // 等待TTL过期
        tokio::time::sleep(Duration::from_millis(100)).await;

        // 现在应该已经过期
        let result2 = cache.get_account_stats(account_id).await;
        assert!(result2.is_none());
    }

    #[tokio::test]
    async fn test_cache_capacity_limit() {
        let cache = SimpleCache::new(2); // 很小的容量
        
        // 添加超过容量的项目
        let stats1 = AccountStats {
            account_id: 1,
            request_count: 10,
            success_rate: 100.0,
            avg_response_time: 100.0,
            last_used_at: None,
        };
        
        let stats2 = AccountStats {
            account_id: 2,
            request_count: 20,
            success_rate: 95.0,
            avg_response_time: 200.0,
            last_used_at: None,
        };
        
        let stats3 = AccountStats {
            account_id: 3,
            request_count: 30,
            success_rate: 90.0,
            avg_response_time: 300.0,
            last_used_at: None,
        };

        cache.set_account_stats(1, stats1, Duration::from_secs(60)).await;
        cache.set_account_stats(2, stats2, Duration::from_secs(60)).await;
        cache.set_account_stats(3, stats3, Duration::from_secs(60)).await; // 这应该导致驱逐

        // 验证最新的项目存在
        assert!(cache.get_account_stats(3).await.is_some());
        
        // 由于容量限制，某些早期项目可能被驱逐
        // 这是LRU缓存的预期行为
    }
}