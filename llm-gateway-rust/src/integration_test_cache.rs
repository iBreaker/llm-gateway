//! 缓存系统集成测试
//! 
//! 测试真实场景下的缓存行为

#[cfg(test)]
mod cache_integration_tests {
    use crate::infrastructure::cache::{SimpleCache, AccountStats};
    use std::time::Duration;

    #[tokio::test]
    async fn test_cache_integration_with_database() {
        // 创建测试缓存
        let cache = SimpleCache::new(100);
        
        // 模拟账号统计数据
        let account_id = 123i64;
        let test_stats = AccountStats {
            account_id,
            request_count: 500,
            success_rate: 98.5,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };

        // 测试缓存设置和获取
        cache.set_account_stats(account_id, test_stats.clone(), Duration::from_secs(300)).await;
        
        let cached_result = cache.get_account_stats(account_id).await;
        assert!(cached_result.is_some());
        
        let cached_stats = cached_result.unwrap();
        assert_eq!(cached_stats.account_id, test_stats.account_id);
        assert_eq!(cached_stats.request_count, test_stats.request_count);
        assert_eq!(cached_stats.success_rate, test_stats.success_rate);
        
        println!("✅ 缓存集成测试：设置和获取统计数据成功");

        // 测试缓存失效
        let removed = cache.remove_account_stats(account_id).await;
        assert!(removed);
        
        let after_removal = cache.get_account_stats(account_id).await;
        assert!(after_removal.is_none());
        
        println!("✅ 缓存集成测试：缓存失效机制正常");
    }

    #[tokio::test]
    async fn test_cache_performance_simulation() {
        let cache = SimpleCache::new(1000);
        let start_time = std::time::Instant::now();
        
        // 模拟大量缓存操作
        for i in 1..=100 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0 + (i as f64) * 0.01,
                avg_response_time: 100.0 + (i as f64) * 2.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        let set_duration = start_time.elapsed();
        println!("✅ 性能测试：设置100个缓存条目耗时 {:?}", set_duration);
        
        // 测试读取性能
        let read_start = std::time::Instant::now();
        let mut hit_count = 0;
        
        for i in 1..=100 {
            if cache.get_account_stats(i).await.is_some() {
                hit_count += 1;
            }
        }
        
        let read_duration = read_start.elapsed();
        println!("✅ 性能测试：读取100个缓存条目耗时 {:?}，命中率 {}/100", read_duration, hit_count);
        
        assert_eq!(hit_count, 100);
    }

    #[tokio::test]
    async fn test_cache_ttl_behavior() {
        let cache = SimpleCache::new(10);
        let account_id = 999i64;
        
        let stats = AccountStats {
            account_id,
            request_count: 1000,
            success_rate: 99.9,
            avg_response_time: 50.0,
            last_used_at: Some(chrono::Utc::now()),
        };

        // 设置很短的TTL
        cache.set_account_stats(account_id, stats, Duration::from_millis(100)).await;
        
        // 立即检查应该存在
        assert!(cache.get_account_stats(account_id).await.is_some());
        println!("✅ TTL测试：缓存立即可用");
        
        // 等待TTL过期
        tokio::time::sleep(Duration::from_millis(150)).await;
        
        // 现在应该过期
        assert!(cache.get_account_stats(account_id).await.is_none());
        println!("✅ TTL测试：缓存按预期过期");
    }
}