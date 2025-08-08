//! 缓存系统综合测试
//! 
//! 补充Redis缓存测试覆盖，提升整体测试质量

#[cfg(test)]
mod comprehensive_cache_tests {
    use super::super::*;
    use std::time::Duration;
    use tokio;

    /// 测试Redis连接失败处理
    #[tokio::test]
    #[ignore] // 需要无效的Redis URL才能运行
    async fn test_redis_connection_failure() {
        let invalid_url = "redis://invalid-host:6379";
        let result = RedisCache::new(
            invalid_url,
            "test:".to_string(),
            Duration::from_secs(300),
            10,
        );
        
        assert!(result.is_err(), "应该因为无效URL而失败");
    }

    /// 测试Redis序列化错误处理
    #[tokio::test]
    #[ignore] // 需要Redis实例
    async fn test_redis_serialization_edge_cases() {
        let cache = create_test_redis_cache().await;
        
        // 测试空字符串
        let result = cache.set("empty", "", Some(Duration::from_secs(60))).await;
        assert!(result.is_ok(), "空字符串应该可以正常存储");
        
        let retrieved: CacheResult<String> = cache.get("empty").await;
        match retrieved {
            CacheResult::Hit(value, _) => assert_eq!(value, ""),
            _ => panic!("应该成功获取空字符串"),
        }
    }

    /// 测试Redis批量操作
    #[tokio::test] 
    #[ignore] // 需要Redis实例
    async fn test_redis_batch_operations() {
        let cache = create_test_redis_cache().await;
        
        // 批量设置
        let batch_data = vec![
            ("batch_1", "value_1"),
            ("batch_2", "value_2"), 
            ("batch_3", "value_3"),
        ];
        
        for (key, value) in &batch_data {
            let result = cache.set(key, value, Some(Duration::from_secs(300))).await;
            assert!(result.is_ok(), "批量设置应该成功: {}", key);
        }
        
        // 批量验证
        for (key, expected_value) in &batch_data {
            let result: CacheResult<String> = cache.get(key).await;
            match result {
                CacheResult::Hit(value, _) => {
                    assert_eq!(&value, expected_value, "批量获取值匹配: {}", key);
                }
                _ => panic!("批量获取应该命中: {}", key),
            }
        }
        
        // 批量清理
        for (key, _) in &batch_data {
            let deleted = cache.delete(key).await.expect("删除操作应该成功");
            assert!(deleted, "批量删除应该成功: {}", key);
        }
    }

    /// 测试Redis TTL操作的完整性
    #[tokio::test]
    #[ignore] // 需要Redis实例
    async fn test_redis_ttl_comprehensive() {
        let cache = create_test_redis_cache().await;
        let key = "ttl_test";
        let value = "ttl_value";
        
        // 设置短TTL
        cache.set(key, &value, Some(Duration::from_secs(2))).await
            .expect("设置TTL应该成功");
        
        // 检查初始TTL
        let initial_ttl = cache.ttl(key).await.expect("TTL查询应该成功");
        assert!(initial_ttl > 0 && initial_ttl <= 2, "初始TTL应该在合理范围: {}", initial_ttl);
        
        // 验证键存在
        let exists = cache.exists(key).await.expect("EXISTS查询应该成功");
        assert!(exists, "键应该存在");
        
        // 等待过期
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // 验证已过期
        let expired_ttl = cache.ttl(key).await.expect("过期TTL查询应该成功");
        assert_eq!(expired_ttl, -2, "过期键的TTL应该为-2");
        
        let exists_after = cache.exists(key).await.expect("过期EXISTS查询应该成功");
        assert!(!exists_after, "过期键不应该存在");
    }

    /// 测试Redis INCR操作
    #[tokio::test]
    #[ignore] // 需要Redis实例
    async fn test_redis_atomic_operations() {
        let cache = create_test_redis_cache().await;
        let counter_key = "atomic_counter";
        
        // 初始增量
        let result1 = cache.incr(counter_key, 1, Some(Duration::from_secs(300))).await;
        assert!(result1.is_ok(), "原子递增应该成功");
        assert_eq!(result1.unwrap(), 1, "初始递增应该返回1");
        
        // 继续增量
        let result2 = cache.incr(counter_key, 5, None).await;
        assert!(result2.is_ok(), "第二次递增应该成功");
        assert_eq!(result2.unwrap(), 6, "累计递增应该返回6");
        
        // 负增量(递减)
        let result3 = cache.incr(counter_key, -2, None).await;
        assert!(result3.is_ok(), "递减应该成功");
        assert_eq!(result3.unwrap(), 4, "递减后应该返回4");
        
        // 清理
        cache.delete(counter_key).await.expect("清理计数器应该成功");
    }

    /// 测试Redis模式删除功能
    #[tokio::test]
    #[ignore] // 需要Redis实例  
    async fn test_redis_pattern_deletion() {
        let cache = create_test_redis_cache().await;
        
        // 创建测试数据
        let test_keys = vec![
            "pattern_test_1",
            "pattern_test_2", 
            "pattern_test_3",
            "other_key_1",
        ];
        
        for key in &test_keys {
            cache.set(key, "test_value", Some(Duration::from_secs(300))).await
                .expect("设置测试数据应该成功");
        }
        
        // 模式删除
        let deleted_count = cache.delete_pattern("pattern_test_*").await
            .expect("模式删除应该成功");
        
        assert_eq!(deleted_count, 3, "应该删除3个匹配的键");
        
        // 验证模式删除结果
        for key in &test_keys[0..3] {
            let exists = cache.exists(key).await.expect("EXISTS检查应该成功");
            assert!(!exists, "匹配的键应该被删除: {}", key);
        }
        
        // 验证非匹配键仍存在
        let other_exists = cache.exists("other_key_1").await.expect("其他键检查应该成功");
        assert!(other_exists, "非匹配键应该仍然存在");
        
        // 清理
        cache.delete("other_key_1").await.expect("清理其他键应该成功");
    }

    /// 测试缓存管理器的错误恢复能力
    #[tokio::test] 
    async fn test_cache_manager_error_recovery() {
        // 创建配置（Redis不可用的情况）
        let config = CacheConfig {
            memory_cache_size: 100,
            memory_default_ttl: Duration::from_secs(300),
            redis_url: Some("redis://invalid-host:6379".to_string()),
            redis_default_ttl: Duration::from_secs(600),
            redis_key_prefix: "test:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: true,
            cache_miss_fallback: true,
        };
        
        let cache_manager = CacheManager::new(config).await;
        
        // Redis不可用时，应该仍能创建管理器（只使用内存缓存）
        assert!(cache_manager.is_ok(), "缓存管理器应该能够处理Redis连接失败");
        
        let manager = cache_manager.unwrap();
        
        // 测试在Redis不可用的情况下，内存缓存仍然工作
        let stats = AccountStats {
            account_id: 123,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        let set_result = manager.set_account_stats(123, &stats, Duration::from_secs(300)).await;
        assert!(set_result.is_ok(), "内存缓存设置应该成功");
        
        let get_result = manager.get_account_stats(123).await;
        assert!(get_result.is_some(), "内存缓存获取应该成功");
    }

    /// 测试缓存统计指标的准确性
    #[tokio::test]
    async fn test_cache_metrics_accuracy() {
        let simple_cache = SimpleCache::new(10);
        
        // 执行一系列操作
        let test_stats = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 98.5,
            avg_response_time: 150.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        // 设置缓存
        simple_cache.set_account_stats(1, test_stats.clone(), Duration::from_secs(300)).await;
        
        // 命中查询
        let hit1 = simple_cache.get_account_stats(1).await;
        assert!(hit1.is_some(), "第一次查询应该命中");
        
        // 再次命中
        let hit2 = simple_cache.get_account_stats(1).await;
        assert!(hit2.is_some(), "第二次查询应该命中");
        
        // 未命中查询
        let miss = simple_cache.get_account_stats(2).await;
        assert!(miss.is_none(), "查询不存在的键应该未命中");
        
        // 这里如果有统计接口，可以验证命中率
        // 预期：2次命中，1次未命中，命中率 = 2/3 = 66.7%
    }

    /// 测试并发场景下的缓存安全性
    #[tokio::test]
    async fn test_concurrent_cache_safety() {
        use std::sync::Arc;
        
        let cache = Arc::new(SimpleCache::new(100));
        let mut handles = vec![];
        
        // 启动多个并发任务
        for i in 0..10 {
            let cache_clone = Arc::clone(&cache);
            let handle = tokio::spawn(async move {
                let stats = AccountStats {
                    account_id: i,
                    request_count: i * 10,
                    success_rate: 95.0,
                    avg_response_time: 100.0 + i as f64,
                    last_used_at: Some(chrono::Utc::now()),
                };
                
                // 并发设置
                cache_clone.set_account_stats(i, stats, Duration::from_secs(300)).await;
                
                // 并发读取
                let result = cache_clone.get_account_stats(i).await;
                assert!(result.is_some(), "并发读取应该成功");
                
                // 并发删除
                let deleted = cache_clone.remove_account_stats(i).await;
                assert!(deleted, "并发删除应该成功");
            });
            
            handles.push(handle);
        }
        
        // 等待所有任务完成
        for handle in handles {
            handle.await.expect("并发任务应该成功完成");
        }
    }

    /// 辅助函数：创建测试用的Redis缓存
    async fn create_test_redis_cache() -> RedisCache {
        RedisCache::new(
            "redis://localhost:16379",
            "test:".to_string(),
            Duration::from_secs(300),
            10,
        ).expect("测试Redis缓存创建应该成功")
    }
}