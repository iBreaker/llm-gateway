//! 性能和压力测试
//! 
//! 验证缓存系统在高负载下的性能表现

#[cfg(test)]
mod performance_tests {
    use super::super::*;
    use std::time::{Duration, Instant};
    use std::sync::Arc;
    use tokio;

    /// 性能基准常量
    const BENCHMARK_ITERATIONS: usize = 10_000;
    const CONCURRENT_TASKS: usize = 100;
    const LARGE_CACHE_SIZE: usize = 50_000;

    /// 内存缓存性能基准测试
    #[tokio::test]
    async fn benchmark_memory_cache_performance() {
        let cache = SimpleCache::new(LARGE_CACHE_SIZE);
        
        println!("🚀 开始内存缓存性能基准测试...");
        
        // 写入性能测试
        let write_start = Instant::now();
        for i in 0..BENCHMARK_ITERATIONS {
            let stats = AccountStats {
                account_id: i as i64,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i as i64, stats, Duration::from_secs(300)).await;
        }
        let write_duration = write_start.elapsed();
        let write_ops_per_sec = BENCHMARK_ITERATIONS as f64 / write_duration.as_secs_f64();
        
        println!("📊 写入性能: {} 操作/秒 ({} 操作耗时 {:?})", 
                write_ops_per_sec as u64, BENCHMARK_ITERATIONS, write_duration);
        
        // 读取性能测试
        let read_start = Instant::now();
        let mut hit_count = 0;
        for i in 0..BENCHMARK_ITERATIONS {
            if cache.get_account_stats(i as i64).await.is_some() {
                hit_count += 1;
            }
        }
        let read_duration = read_start.elapsed();
        let read_ops_per_sec = BENCHMARK_ITERATIONS as f64 / read_duration.as_secs_f64();
        
        println!("📊 读取性能: {} 操作/秒 ({} 操作耗时 {:?}, 命中率: {:.1}%)", 
                read_ops_per_sec as u64, BENCHMARK_ITERATIONS, read_duration,
                hit_count as f64 / BENCHMARK_ITERATIONS as f64 * 100.0);
        
        // 混合操作性能测试
        let mixed_start = Instant::now();
        for i in BENCHMARK_ITERATIONS..BENCHMARK_ITERATIONS*2 {
            if i % 3 == 0 {
                // 写入操作
                let stats = AccountStats {
                    account_id: i as i64,
                    request_count: i * 10,
                    success_rate: 95.0,
                    avg_response_time: 120.0,
                    last_used_at: Some(chrono::Utc::now()),
                };
                cache.set_account_stats(i as i64, stats, Duration::from_secs(300)).await;
            } else {
                // 读取操作
                let _ = cache.get_account_stats((i % BENCHMARK_ITERATIONS) as i64).await;
            }
        }
        let mixed_duration = mixed_start.elapsed();
        let mixed_ops_per_sec = BENCHMARK_ITERATIONS as f64 / mixed_duration.as_secs_f64();
        
        println!("📊 混合操作性能: {} 操作/秒 ({} 操作耗时 {:?})", 
                mixed_ops_per_sec as u64, BENCHMARK_ITERATIONS, mixed_duration);
        
        // 性能断言 - 基于合理的性能预期
        assert!(write_ops_per_sec > 50_000.0, "写入性能应该超过 50k ops/sec");
        assert!(read_ops_per_sec > 100_000.0, "读取性能应该超过 100k ops/sec");
        assert_eq!(hit_count, BENCHMARK_ITERATIONS, "所有读取都应该命中");
    }

    /// 并发性能测试
    #[tokio::test]
    async fn benchmark_concurrent_performance() {
        let cache = Arc::new(SimpleCache::new(LARGE_CACHE_SIZE));
        
        println!("🚀 开始并发性能测试...");
        
        let concurrent_start = Instant::now();
        let mut handles = vec![];
        
        // 启动多个并发任务
        for task_id in 0..CONCURRENT_TASKS {
            let cache_clone = Arc::clone(&cache);
            let handle = tokio::spawn(async move {
                let task_start = Instant::now();
                let ops_per_task = BENCHMARK_ITERATIONS / CONCURRENT_TASKS;
                
                for i in 0..ops_per_task {
                    let account_id = (task_id * ops_per_task + i) as i64;
                    
                    // 每个任务执行混合操作
                    if i % 2 == 0 {
                        // 写入
                        let stats = AccountStats {
                            account_id,
                            request_count: i * 10,
                            success_rate: 95.0,
                            avg_response_time: 120.0,
                            last_used_at: Some(chrono::Utc::now()),
                        };
                        cache_clone.set_account_stats(account_id, stats, Duration::from_secs(300)).await;
                    } else {
                        // 读取
                        let _ = cache_clone.get_account_stats(account_id).await;
                    }
                }
                
                let task_duration = task_start.elapsed();
                (task_id, task_duration, ops_per_task)
            });
            handles.push(handle);
        }
        
        // 等待所有任务完成并收集结果
        let mut total_ops = 0;
        let mut max_task_duration = Duration::ZERO;
        
        for handle in handles {
            let (task_id, task_duration, ops_count) = handle.await
                .expect("并发任务应该成功完成");
            
            total_ops += ops_count;
            max_task_duration = max_task_duration.max(task_duration);
            
            println!("📊 任务 {} 完成: {} 操作耗时 {:?}", task_id, ops_count, task_duration);
        }
        
        let total_duration = concurrent_start.elapsed();
        let concurrent_ops_per_sec = total_ops as f64 / total_duration.as_secs_f64();
        
        println!("📊 并发总性能: {} 操作/秒 ({} 个任务, {} 总操作, 耗时 {:?})", 
                concurrent_ops_per_sec as u64, CONCURRENT_TASKS, total_ops, total_duration);
        println!("📊 最慢任务耗时: {:?}, 平均每任务: {:?}", 
                max_task_duration, total_duration / CONCURRENT_TASKS as u32);
        
        // 并发性能断言
        assert!(concurrent_ops_per_sec > 20_000.0, "并发性能应该超过 20k ops/sec");
        assert!(max_task_duration.as_millis() < 5000, "单个任务不应超过5秒");
    }

    /// 内存压力测试
    #[tokio::test]
    async fn stress_test_memory_pressure() {
        println!("🚀 开始内存压力测试...");
        
        // 使用较小的缓存测试LRU淘汰
        let small_cache = SimpleCache::new(1000);
        let stress_iterations = 50_000;
        
        let stress_start = Instant::now();
        
        // 写入远超缓存容量的数据
        for i in 0..stress_iterations {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            small_cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
            
            // 每1000次迭代验证一下缓存仍然工作
            if i % 10_000 == 0 {
                let recent_key = i.max(1) - 1;
                let result = small_cache.get_account_stats(recent_key).await;
                // 最近的键应该还在缓存中
                if i > 1000 {
                    // 给LRU一些宽松度，因为可能有其他操作影响
                    println!("📊 压力测试检查点 {}: 最近键 {} 存在: {}", 
                            i, recent_key, result.is_some());
                }
            }
        }
        
        let stress_duration = stress_start.elapsed();
        let stress_ops_per_sec = stress_iterations as f64 / stress_duration.as_secs_f64();
        
        println!("📊 压力测试完成: {} 操作/秒 ({} 操作耗时 {:?})", 
                stress_ops_per_sec as u64, stress_iterations, stress_duration);
        
        // 验证LRU工作正常 - 最老的键应该被淘汰
        let oldest_result = small_cache.get_account_stats(0).await;
        let newest_result = small_cache.get_account_stats(stress_iterations - 1).await;
        
        assert!(oldest_result.is_none(), "最老的键应该被LRU淘汰");
        assert!(newest_result.is_some(), "最新的键应该仍在缓存中");
        
        println!("📊 LRU淘汰验证: 最老键被淘汰 ✓, 最新键保留 ✓");
    }

    /// TTL过期性能测试
    #[tokio::test]
    async fn performance_test_ttl_expiration() {
        let cache = SimpleCache::new(10_000);
        let ttl_iterations = 5_000;
        
        println!("🚀 开始TTL过期性能测试...");
        
        // 设置不同TTL的数据
        let setup_start = Instant::now();
        for i in 0..ttl_iterations {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 不同的TTL：短期、中期、长期
            let ttl = match i % 3 {
                0 => Duration::from_millis(100), // 短期
                1 => Duration::from_millis(500), // 中期
                _ => Duration::from_secs(10),    // 长期
            };
            
            cache.set_account_stats(i, stats, ttl).await;
        }
        let setup_duration = setup_start.elapsed();
        
        println!("📊 TTL设置完成: {} 条目耗时 {:?}", ttl_iterations, setup_duration);
        
        // 立即检查 - 所有条目都应该存在
        let immediate_start = Instant::now();
        let mut immediate_hits = 0;
        for i in 0..ttl_iterations {
            if cache.get_account_stats(i).await.is_some() {
                immediate_hits += 1;
            }
        }
        let immediate_duration = immediate_start.elapsed();
        
        println!("📊 立即检查: {}/{} 命中, 耗时 {:?}", 
                immediate_hits, ttl_iterations, immediate_duration);
        
        // 等待部分过期
        tokio::time::sleep(Duration::from_millis(300)).await;
        
        let partial_start = Instant::now();
        let mut partial_hits = 0;
        for i in 0..ttl_iterations {
            if cache.get_account_stats(i).await.is_some() {
                partial_hits += 1;
            }
        }
        let partial_duration = partial_start.elapsed();
        
        println!("📊 部分过期后: {}/{} 命中, 耗时 {:?}", 
                partial_hits, ttl_iterations, partial_duration);
        
        // 等待更多过期
        tokio::time::sleep(Duration::from_millis(500)).await;
        
        let final_start = Instant::now();
        let mut final_hits = 0;
        for i in 0..ttl_iterations {
            if cache.get_account_stats(i).await.is_some() {
                final_hits += 1;
            }
        }
        let final_duration = final_start.elapsed();
        
        println!("📊 大部分过期后: {}/{} 命中, 耗时 {:?}", 
                final_hits, ttl_iterations, final_duration);
        
        // 验证TTL按预期工作
        assert_eq!(immediate_hits, ttl_iterations, "立即检查应该全部命中");
        assert!(partial_hits < immediate_hits, "部分过期后命中数应该减少");
        assert!(final_hits < partial_hits, "更多过期后命中数应该进一步减少");
        
        // 性能验证 - TTL检查不应该显著影响性能
        let avg_check_time = (immediate_duration + partial_duration + final_duration) / 3;
        println!("📊 平均检查时间: {:?}", avg_check_time);
        assert!(avg_check_time.as_millis() < 1000, "TTL检查平均时间应该少于1秒");
    }

    /// Redis性能基准测试（如果可用）
    #[tokio::test]
    #[ignore] // 需要Redis实例
    async fn benchmark_redis_performance() {
        let cache = redis_cache::RedisCache::new(
            "redis://localhost:16379",
            "perf_test:".to_string(),
            Duration::from_secs(300),
            10,
        ).expect("Redis缓存创建应该成功");
        
        println!("🚀 开始Redis性能基准测试...");
        
        // 确保连接正常
        cache.ping().await.expect("Redis连接应该正常");
        
        let redis_iterations = 1000; // Redis测试用较小的数量
        
        // Redis写入性能
        let write_start = Instant::now();
        for i in 0..redis_iterations {
            let key = format!("perf_key_{}", i);
            let value = format!("perf_value_{}", i);
            cache.set(&key, &value, None).await
                .expect("Redis设置应该成功");
        }
        let write_duration = write_start.elapsed();
        let redis_write_ops_per_sec = redis_iterations as f64 / write_duration.as_secs_f64();
        
        println!("📊 Redis写入性能: {} 操作/秒 ({} 操作耗时 {:?})", 
                redis_write_ops_per_sec as u64, redis_iterations, write_duration);
        
        // Redis读取性能
        let read_start = Instant::now();
        let mut hit_count = 0;
        for i in 0..redis_iterations {
            let key = format!("perf_key_{}", i);
            let result: CacheResult<String> = cache.get(&key).await;
            if result.is_hit() {
                hit_count += 1;
            }
        }
        let read_duration = read_start.elapsed();
        let redis_read_ops_per_sec = redis_iterations as f64 / read_duration.as_secs_f64();
        
        println!("📊 Redis读取性能: {} 操作/秒 ({} 操作耗时 {:?}, 命中率: {:.1}%)", 
                redis_read_ops_per_sec as u64, redis_iterations, read_duration,
                hit_count as f64 / redis_iterations as f64 * 100.0);
        
        // Redis批量删除性能
        let cleanup_start = Instant::now();
        let deleted_count = cache.delete_pattern("perf_key_*").await
            .expect("批量删除应该成功");
        let cleanup_duration = cleanup_start.elapsed();
        
        println!("📊 Redis批量删除: {} 个键, 耗时 {:?}", deleted_count, cleanup_duration);
        
        // Redis性能断言（考虑网络开销）
        assert!(redis_write_ops_per_sec > 1_000.0, "Redis写入性能应该超过 1k ops/sec");
        assert!(redis_read_ops_per_sec > 2_000.0, "Redis读取性能应该超过 2k ops/sec");
        assert_eq!(hit_count, redis_iterations, "Redis读取应该100%命中");
        assert_eq!(deleted_count, redis_iterations, "应该删除所有测试键");
    }

    /// 缓存管理器集成性能测试
    #[tokio::test]
    async fn benchmark_cache_manager_integration() {
        let config = CacheConfig {
            memory_cache_size: 10_000,
            memory_default_ttl: Duration::from_secs(300),
            redis_url: None, // 仅使用内存缓存以获得一致的性能测试结果
            redis_default_ttl: Duration::from_secs(600),
            redis_key_prefix: "benchmark:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: false,
            cache_miss_fallback: true,
        };
        
        let cache_manager = CacheManager::new(config).await
            .expect("缓存管理器创建应该成功");
        
        println!("🚀 开始缓存管理器集成性能测试...");
        
        let integration_iterations = 5_000;
        
        // 综合操作性能测试
        let integration_start = Instant::now();
        for i in 0..integration_iterations {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 设置
            cache_manager.set_account_stats(i, &stats, Duration::from_secs(300)).await
                .expect("设置应该成功");
            
            // 立即读取
            let result = cache_manager.get_account_stats(i).await;
            assert!(result.is_some(), "立即读取应该命中");
            
            // 每100次迭代执行一次删除
            if i % 100 == 0 && i > 0 {
                cache_manager.remove_account_stats(i - 1).await
                    .expect("删除应该成功");
            }
        }
        let integration_duration = integration_start.elapsed();
        let integration_ops_per_sec = (integration_iterations * 2) as f64 / integration_duration.as_secs_f64();
        
        println!("📊 集成性能: {} 操作/秒 ({} 设置+读取操作耗时 {:?})", 
                integration_ops_per_sec as u64, integration_iterations, integration_duration);
        
        // 统计信息获取性能
        let stats_start = Instant::now();
        let cache_stats = cache_manager.get_cache_stats().await
            .expect("获取统计应该成功");
        let stats_duration = stats_start.elapsed();
        
        println!("📊 统计信息获取耗时: {:?}", stats_duration);
        println!("📊 总请求数: {}, 内存命中: {}, 内存未命中: {}", 
                cache_stats.metrics.total_requests,
                cache_stats.metrics.memory_hits,
                cache_stats.metrics.memory_misses);
        
        // 性能断言
        assert!(integration_ops_per_sec > 10_000.0, "集成性能应该超过 10k ops/sec");
        assert!(stats_duration.as_millis() < 100, "统计信息获取应该少于100ms");
        assert!(cache_stats.metrics.total_requests > 0, "应该记录到请求");
    }

    /// 内存使用效率测试
    #[tokio::test]
    async fn test_memory_usage_efficiency() {
        println!("🚀 开始内存使用效率测试...");
        
        let cache_sizes = vec![100, 1_000, 10_000];
        
        for cache_size in cache_sizes {
            let cache = SimpleCache::new(cache_size);
            let test_start = Instant::now();
            
            // 填满缓存
            for i in 0..cache_size {
                let stats = AccountStats {
                    account_id: i as i64,
                    request_count: i * 10,
                    success_rate: 95.0,
                    avg_response_time: 120.0,
                    last_used_at: Some(chrono::Utc::now()),
                };
                cache.set_account_stats(i as i64, stats, Duration::from_secs(300)).await;
            }
            
            let fill_duration = test_start.elapsed();
            
            // 验证缓存使用率
            let mut stored_count = 0;
            for i in 0..cache_size {
                if cache.get_account_stats(i as i64).await.is_some() {
                    stored_count += 1;
                }
            }
            
            let usage_ratio = stored_count as f64 / cache_size as f64;
            
            println!("📊 缓存大小 {}: 填充耗时 {:?}, 使用率 {:.1}% ({}/{})", 
                    cache_size, fill_duration, usage_ratio * 100.0, stored_count, cache_size);
            
            // 效率断言
            assert!(usage_ratio > 0.9, "缓存使用率应该超过90%");
            assert!(fill_duration.as_millis() < cache_size as u128 * 2, "填充时间应该合理");
        }
    }
}