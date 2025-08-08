//! 边界条件和异常场景测试
//! 
//! 确保缓存系统在各种极端情况下的稳定性

#[cfg(test)]
mod edge_case_tests {
    use super::super::*;
    use std::time::Duration;
    use tokio;

    /// 测试零容量缓存
    #[test]
    fn test_zero_capacity_cache() {
        let cache = memory_cache::MemoryCache::<String, String>::new(0);
        
        // 零容量缓存不应该存储任何数据
        cache.set("key".to_string(), "value".to_string(), Duration::from_secs(60));
        let result = cache.get(&"key".to_string());
        assert!(result.is_none(), "零容量缓存不应该存储数据");
    }

    /// 测试单容量缓存的LRU行为
    #[test]
    fn test_single_capacity_cache() {
        let cache = memory_cache::MemoryCache::<String, String>::new(1);
        
        // 设置第一个值
        cache.set("key1".to_string(), "value1".to_string(), Duration::from_secs(60));
        assert!(cache.get(&"key1".to_string()).is_some(), "第一个值应该存在");
        
        // 设置第二个值，应该淘汰第一个
        cache.set("key2".to_string(), "value2".to_string(), Duration::from_secs(60));
        assert!(cache.get(&"key1".to_string()).is_none(), "第一个值应该被淘汰");
        assert!(cache.get(&"key2".to_string()).is_some(), "第二个值应该存在");
    }

    /// 测试极长TTL
    #[test]
    fn test_extreme_long_ttl() {
        let cache = memory_cache::MemoryCache::<String, String>::new(10);
        let extreme_ttl = Duration::from_secs(u64::MAX / 1000); // 避免溢出
        
        cache.set("long_ttl_key".to_string(), "value".to_string(), extreme_ttl);
        let result = cache.get(&"long_ttl_key".to_string());
        assert!(result.is_some(), "极长TTL的值应该存在");
    }

    /// 测试零TTL
    #[test]
    fn test_zero_ttl() {
        let cache = memory_cache::MemoryCache::<String, String>::new(10);
        
        cache.set("zero_ttl_key".to_string(), "value".to_string(), Duration::ZERO);
        let result = cache.get(&"zero_ttl_key".to_string());
        assert!(result.is_none(), "零TTL的值应该立即过期");
    }

    /// 测试空键值处理
    #[tokio::test]
    async fn test_empty_key_value_handling() {
        let cache = SimpleCache::new(10);
        
        // 空字符串值
        let stats = AccountStats {
            account_id: 0, // 边界值账号ID
            request_count: 0, // 零请求计数
            success_rate: 0.0, // 零成功率
            avg_response_time: 0.0, // 零响应时间
            last_used_at: None, // 空时间
        };
        
        cache.set_account_stats(0, stats.clone(), Duration::from_secs(300)).await;
        let result = cache.get_account_stats(0).await;
        
        assert!(result.is_some(), "空值也应该能正常存储和获取");
        let retrieved = result.unwrap();
        assert_eq!(retrieved.account_id, 0);
        assert_eq!(retrieved.request_count, 0);
        assert_eq!(retrieved.success_rate, 0.0);
    }

    /// 测试极大数值处理
    #[tokio::test]
    async fn test_extreme_large_values() {
        let cache = SimpleCache::new(10);
        
        let stats = AccountStats {
            account_id: i64::MAX,
            request_count: i64::MAX,
            success_rate: 100.0,
            avg_response_time: f64::MAX / 1000.0, // 避免序列化问题
            last_used_at: Some(chrono::DateTime::from_timestamp(i64::MAX / 1000, 0).unwrap_or(chrono::Utc::now())),
        };
        
        cache.set_account_stats(i64::MAX, stats.clone(), Duration::from_secs(300)).await;
        let result = cache.get_account_stats(i64::MAX).await;
        
        assert!(result.is_some(), "极大数值应该能正常处理");
        let retrieved = result.unwrap();
        assert_eq!(retrieved.account_id, i64::MAX);
        assert_eq!(retrieved.request_count, i64::MAX);
    }

    /// 测试负数值处理
    #[tokio::test]
    async fn test_negative_values() {
        let cache = SimpleCache::new(10);
        
        let stats = AccountStats {
            account_id: -1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        cache.set_account_stats(-1, stats.clone(), Duration::from_secs(300)).await;
        let result = cache.get_account_stats(-1).await;
        
        assert!(result.is_some(), "负数账号ID应该能正常处理");
        assert_eq!(result.unwrap().account_id, -1);
    }

    /// 测试浮点数边界值
    #[tokio::test]
    async fn test_float_boundary_values() {
        let cache = SimpleCache::new(10);
        
        // 测试NaN值
        let nan_stats = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: f64::NAN,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        cache.set_account_stats(1, nan_stats, Duration::from_secs(300)).await;
        let result = cache.get_account_stats(1).await;
        
        assert!(result.is_some(), "NaN值应该能存储");
        let retrieved = result.unwrap();
        assert!(retrieved.success_rate.is_nan(), "NaN值应该保持");
        
        // 测试无穷大值
        let infinity_stats = AccountStats {
            account_id: 2,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: f64::INFINITY,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        cache.set_account_stats(2, infinity_stats, Duration::from_secs(300)).await;
        let result2 = cache.get_account_stats(2).await;
        
        assert!(result2.is_some(), "无穷大值应该能存储");
        assert!(result2.unwrap().avg_response_time.is_infinite(), "无穷大值应该保持");
    }

    /// 测试缓存容量边界行为
    #[tokio::test]
    async fn test_cache_capacity_boundary() {
        let cache = SimpleCache::new(3); // 小容量便于测试
        
        // 填满缓存
        for i in 1..=3 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        // 验证所有值都存在
        for i in 1..=3 {
            assert!(cache.get_account_stats(i).await.is_some(), "容量内的值应该存在: {}", i);
        }
        
        // 添加第四个值，应该触发淘汰
        let stats4 = AccountStats {
            account_id: 4,
            request_count: 40,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        cache.set_account_stats(4, stats4, Duration::from_secs(300)).await;
        
        // 验证容量限制生效
        let total_existing = (1..=4).map(|i| cache.get_account_stats(i)).count();
        assert_eq!(total_existing, 4, "应该有4个查询操作"); // 这里实际测试存储的是3个，有1个被淘汰
        
        // 验证至少有一个值被淘汰
        let mut exists_count = 0;
        for i in 1..=4 {
            if (cache.get_account_stats(i).await).is_some() {
                exists_count += 1;
            }
        }
        assert_eq!(exists_count, 3, "应该只有3个值存在，1个被淘汰");
    }

    /// 测试重复键覆盖行为
    #[tokio::test]
    async fn test_duplicate_key_overwrite() {
        let cache = SimpleCache::new(10);
        
        // 设置初始值
        let stats1 = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        cache.set_account_stats(1, stats1, Duration::from_secs(300)).await;
        
        // 覆盖相同键
        let stats2 = AccountStats {
            account_id: 1,
            request_count: 200, // 不同值
            success_rate: 98.0,
            avg_response_time: 100.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        cache.set_account_stats(1, stats2, Duration::from_secs(300)).await;
        
        // 验证新值覆盖了旧值
        let result = cache.get_account_stats(1).await;
        assert!(result.is_some());
        let retrieved = result.unwrap();
        assert_eq!(retrieved.request_count, 200, "应该是新的值");
        assert_eq!(retrieved.success_rate, 98.0, "应该是新的成功率");
    }

    /// 测试TTL过期的精确性
    #[tokio::test] 
    async fn test_ttl_precision() {
        let cache = SimpleCache::new(10);
        let short_ttl = Duration::from_millis(50); // 50毫秒TTL
        
        let stats = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        cache.set_account_stats(1, stats, short_ttl).await;
        
        // 立即查询应该存在
        assert!(cache.get_account_stats(1).await.is_some(), "立即查询应该命中");
        
        // 等待TTL一半时间，应该仍然存在
        tokio::time::sleep(Duration::from_millis(25)).await;
        assert!(cache.get_account_stats(1).await.is_some(), "TTL一半时间应该仍然存在");
        
        // 等待TTL完全过期
        tokio::time::sleep(Duration::from_millis(30)).await; // 总计55ms > 50ms
        assert!(cache.get_account_stats(1).await.is_none(), "TTL过期后应该不存在");
    }

    /// 测试大量键的性能表现
    #[tokio::test]
    async fn test_large_scale_operations() {
        let cache = SimpleCache::new(1000);
        let key_count = 500;
        
        // 批量插入
        let start = std::time::Instant::now();
        for i in 1..=key_count {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        let insert_duration = start.elapsed();
        println!("批量插入{}个键耗时: {:?}", key_count, insert_duration);
        
        // 批量查询
        let start = std::time::Instant::now();
        let mut hit_count = 0;
        for i in 1..=key_count {
            if cache.get_account_stats(i).await.is_some() {
                hit_count += 1;
            }
        }
        let query_duration = start.elapsed();
        println!("批量查询{}个键耗时: {:?}, 命中率: {}/{}", key_count, query_duration, hit_count, key_count);
        
        assert_eq!(hit_count, key_count, "所有键都应该命中");
        
        // 性能基准检查（这些值可以根据实际性能调整）
        assert!(insert_duration.as_millis() < 1000, "批量插入应该在1秒内完成");
        assert!(query_duration.as_millis() < 500, "批量查询应该在0.5秒内完成");
    }

    /// 测试内存清理行为
    #[tokio::test]
    async fn test_memory_cleanup_behavior() {
        let cache = SimpleCache::new(5);
        
        // 填满缓存
        for i in 1..=5 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_millis(100)).await; // 短TTL
        }
        
        // 验证所有值存在
        for i in 1..=5 {
            assert!(cache.get_account_stats(i).await.is_some(), "初始值应该存在: {}", i);
        }
        
        // 等待TTL过期
        tokio::time::sleep(Duration::from_millis(150)).await;
        
        // 查询过期的值（应该触发清理）
        for i in 1..=5 {
            assert!(cache.get_account_stats(i).await.is_none(), "过期值应该不存在: {}", i);
        }
        
        // 添加新值，验证过期的值确实被清理了
        for i in 6..=10 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        // 验证新值都能正常存储（说明内存被正确清理）
        for i in 6..=10 {
            assert!(cache.get_account_stats(i).await.is_some(), "新值应该存在: {}", i);
        }
    }
}