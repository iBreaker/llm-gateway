//! 错误处理和异常场景测试
//! 
//! 确保缓存系统在各种错误情况下的健壮性

#[cfg(test)]
mod error_handling_tests {
    use super::super::*;
    use std::time::Duration;
    use tokio;

    /// 测试Redis连接中断后的恢复
    #[tokio::test]
    #[ignore] // 需要手动模拟Redis中断
    async fn test_redis_connection_recovery() {
        // 这个测试需要在测试过程中手动停止和重启Redis
        let cache = redis_cache::RedisCache::new(
            "redis://localhost:16379",
            "test_recovery:".to_string(),
            Duration::from_secs(300),
            10,
        ).expect("Redis缓存创建应该成功");
        
        // 初始连接应该工作
        assert!(cache.ping().await.is_ok(), "初始连接应该成功");
        
        // 设置测试数据
        let test_key = "recovery_test";
        let test_value = "recovery_value";
        assert!(cache.set(test_key, &test_value, None).await.is_ok(), "初始设置应该成功");
        
        // 在这里手动停止Redis服务，然后重启
        // 实际测试中可以用Docker容器来模拟
        println!("请手动重启Redis服务，然后按回车继续...");
        
        // 测试恢复后的功能
        tokio::time::sleep(Duration::from_secs(2)).await;
        
        let recovered_result: CacheResult<String> = cache.get(test_key).await;
        // 根据Redis持久化设置，数据可能存在也可能不存在
        // 关键是连接应该能够恢复
        println!("恢复后查询结果: {:?}", recovered_result);
    }

    /// 测试内存不足场景处理
    #[tokio::test]
    async fn test_memory_pressure_handling() {
        // 创建一个非常小的缓存来模拟内存压力
        let cache = SimpleCache::new(2);
        
        // 尝试存储超出容量的数据
        for i in 1..=10 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 1000,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 每次设置都应该成功，但会触发LRU淘汰
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        // 验证缓存仍然工作，只是容量受限
        let mut existing_count = 0;
        for i in 1..=10 {
            if cache.get_account_stats(i).await.is_some() {
                existing_count += 1;
            }
        }
        
        assert_eq!(existing_count, 2, "应该只保留最新的2个条目");
        
        // 验证最新的条目存在（LRU应该保留最近使用的）
        assert!(cache.get_account_stats(9).await.is_some() || cache.get_account_stats(10).await.is_some(), 
                "最新的条目应该存在");
    }

    /// 测试JSON序列化/反序列化错误
    #[tokio::test]
    #[ignore] // 需要Redis实例
    async fn test_json_serialization_errors() {
        let cache = redis_cache::RedisCache::new(
            "redis://localhost:16379",
            "test_json:".to_string(),
            Duration::from_secs(300),
            10,
        ).expect("Redis缓存创建应该成功");
        
        // 手动插入无效的JSON数据到Redis
        let invalid_json_key = "invalid_json_key";
        
        // 直接通过Redis客户端插入无效JSON
        use redis::AsyncCommands;
        let client = redis::Client::open("redis://localhost:16379").unwrap();
        let mut conn = client.get_async_connection().await.unwrap();
        let full_key = format("test_json:{}", invalid_json_key);
        let _: () = conn.set(&full_key, "{ invalid json }").await.unwrap();
        
        // 尝试通过缓存获取（应该返回反序列化错误）
        let result: CacheResult<serde_json::Value> = cache.get(invalid_json_key).await;
        
        match result {
            CacheResult::Error(_) => {
                // 预期的错误结果
            },
            _ => panic!("应该返回反序列化错误"),
        }
        
        // 清理
        let _: i32 = conn.del(&full_key).await.unwrap();
    }

    /// 测试网络超时处理
    #[tokio::test]
    #[ignore] // 需要网络模拟
    async fn test_network_timeout_handling() {
        // 使用一个不存在但路由可达的Redis地址来模拟超时
        let timeout_cache = redis_cache::RedisCache::new(
            "redis://192.0.2.1:6379", // 测试网段地址，会超时
            "timeout_test:".to_string(),
            Duration::from_secs(300),
            10,
        );
        
        if timeout_cache.is_ok() {
            let cache = timeout_cache.unwrap();
            
            // 设置操作应该超时并返回错误
            let result = cache.set("timeout_key", &"timeout_value", None).await;
            assert!(result.is_err(), "超时操作应该返回错误");
            
            // 获取操作也应该超时
            let get_result: CacheResult<String> = cache.get("timeout_key").await;
            match get_result {
                CacheResult::Error(_) => {
                    // 预期的超时错误
                },
                _ => panic!("超时操作应该返回错误"),
            }
        }
    }

    /// 测试缓存管理器错误场景恢复
    #[tokio::test]
    async fn test_cache_manager_error_scenarios() {
        // 创建一个Redis不可用的配置
        let config = CacheConfig {
            memory_cache_size: 100,
            memory_default_ttl: Duration::from_secs(300),
            redis_url: Some("redis://invalid.host:6379".to_string()),
            redis_default_ttl: Duration::from_secs(600),
            redis_key_prefix: "error_test:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: true,
            cache_miss_fallback: true,
        };
        
        // 缓存管理器应该能够创建（回退到仅内存模式）
        let cache_manager_result = CacheManager::new(config).await;
        assert!(cache_manager_result.is_ok(), "缓存管理器应该能在Redis不可用时创建");
        
        let cache_manager = cache_manager_result.unwrap();
        
        // 测试各种操作在Redis不可用时的行为
        let stats = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        // 设置应该成功（使用内存缓存）
        let set_result = cache_manager.set_account_stats(1, &stats, Duration::from_secs(300)).await;
        assert!(set_result.is_ok(), "在Redis不可用时，内存缓存设置应该成功");
        
        // 获取应该成功
        let get_result = cache_manager.get_account_stats(1).await;
        assert!(get_result.is_some(), "在Redis不可用时，内存缓存获取应该成功");
        
        // 删除应该成功
        let remove_result = cache_manager.remove_account_stats(1).await;
        assert!(remove_result.is_ok(), "在Redis不可用时，内存缓存删除应该成功");
    }

    /// 测试并发写入冲突处理
    #[tokio::test]
    async fn test_concurrent_write_conflicts() {
        use std::sync::Arc;
        
        let cache = Arc::new(SimpleCache::new(100));
        let mut handles = vec![];
        
        // 同时写入相同的键
        for thread_id in 0..10 {
            let cache_clone = Arc::clone(&cache);
            let handle = tokio::spawn(async move {
                for iteration in 0..10 {
                    let stats = AccountStats {
                        account_id: 1, // 所有线程写入同一个键
                        request_count: (thread_id * 100 + iteration),
                        success_rate: 95.0,
                        avg_response_time: 120.0,
                        last_used_at: Some(chrono::Utc::now()),
                    };
                    
                    cache_clone.set_account_stats(1, stats, Duration::from_secs(300)).await;
                    
                    // 小延迟增加竞争条件
                    tokio::time::sleep(Duration::from_millis(1)).await;
                }
            });
            handles.push(handle);
        }
        
        // 等待所有写入完成
        for handle in handles {
            handle.await.expect("并发写入任务应该完成");
        }
        
        // 验证最终状态一致
        let final_result = cache.get_account_stats(1).await;
        assert!(final_result.is_some(), "并发写入后应该有最终值");
        
        // 值应该是某个线程写入的有效值
        let final_stats = final_result.unwrap();
        assert_eq!(final_stats.account_id, 1);
        assert!(final_stats.request_count < 1000, "请求计数应该在合理范围内");
    }

    /// 测试异常TTL值处理
    #[tokio::test]
    async fn test_abnormal_ttl_handling() {
        let cache = SimpleCache::new(10);
        
        // 测试极小TTL
        let stats1 = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        cache.set_account_stats(1, stats1, Duration::from_nanos(1)).await;
        
        // 纳秒级TTL应该立即过期
        tokio::time::sleep(Duration::from_millis(1)).await;
        assert!(cache.get_account_stats(1).await.is_none(), "纳秒级TTL应该立即过期");
        
        // 测试非常大的TTL（但不会溢出）
        let stats2 = AccountStats {
            account_id: 2,
            request_count: 200,
            success_rate: 98.0,
            avg_response_time: 110.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        let very_long_ttl = Duration::from_secs(365 * 24 * 3600); // 1年
        cache.set_account_stats(2, stats2, very_long_ttl).await;
        
        // 长TTL的值应该存在
        assert!(cache.get_account_stats(2).await.is_some(), "长TTL的值应该存在");
    }

    /// 测试缓存统计指标错误恢复
    #[tokio::test]
    async fn test_cache_metrics_error_recovery() {
        let config = CacheConfig {
            memory_cache_size: 10,
            memory_default_ttl: Duration::from_secs(300),
            redis_url: None, // 禁用Redis
            redis_default_ttl: Duration::from_secs(600),
            redis_key_prefix: "metrics_test:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: false,
            cache_miss_fallback: true,
        };
        
        let cache_manager = CacheManager::new(config).await
            .expect("缓存管理器应该创建成功");
        
        // 执行一系列操作来生成指标
        for i in 1..=5 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 设置
            cache_manager.set_account_stats(i, &stats, Duration::from_secs(300)).await.unwrap();
            
            // 获取（命中）
            assert!(cache_manager.get_account_stats(i).await.is_some());
        }
        
        // 未命中查询
        for i in 10..=15 {
            assert!(cache_manager.get_account_stats(i).await.is_none());
        }
        
        // 获取统计信息应该成功，即使有错误场景
        let stats_result = cache_manager.get_cache_stats().await;
        assert!(stats_result.is_ok(), "获取缓存统计应该成功");
        
        let stats = stats_result.unwrap();
        assert!(stats.metrics.total_requests > 0, "应该记录总请求数");
        assert!(stats.metrics.memory_hits > 0, "应该记录内存命中");
        assert!(stats.metrics.memory_misses > 0, "应该记录内存未命中");
    }

    /// 测试资源清理和内存泄漏预防
    #[tokio::test]
    async fn test_resource_cleanup_prevention() {
        // 创建多个缓存实例并快速销毁，检查资源清理
        for _ in 0..100 {
            let cache = SimpleCache::new(10);
            
            // 快速添加和查询数据
            let stats = AccountStats {
                account_id: 1,
                request_count: 100,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            cache.set_account_stats(1, stats, Duration::from_secs(1)).await;
            let _ = cache.get_account_stats(1).await;
            
            // 缓存会在作用域结束时自动销毁
        }
        
        // 如果有内存泄漏，这里的内存使用量会很高
        // 实际测试中可以使用内存监控工具验证
    }

    /// 测试无效键名处理
    #[tokio::test]
    async fn test_invalid_key_handling() {
        let cache = SimpleCache::new(10);
        
        // 测试边界账号ID
        let boundary_ids = vec![
            0,
            -1,
            i64::MIN,
            i64::MAX,
        ];
        
        for account_id in boundary_ids {
            let stats = AccountStats {
                account_id,
                request_count: 100,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 所有边界值都应该能正常处理
            cache.set_account_stats(account_id, stats, Duration::from_secs(300)).await;
            let result = cache.get_account_stats(account_id).await;
            assert!(result.is_some(), "边界账号ID应该能正常处理: {}", account_id);
            assert_eq!(result.unwrap().account_id, account_id);
        }
    }
}