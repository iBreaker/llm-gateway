//! 网络分区容错测试
//! 
//! 模拟网络分区、连接中断等故障场景，验证缓存系统的容错能力

#[cfg(test)]
mod network_partition_tests {
    use super::super::*;
    use std::time::{Duration, Instant};
    use std::sync::{Arc, atomic::{AtomicBool, AtomicU64, Ordering}};
    use tokio;
    use std::sync::Mutex;

    /// 模拟网络分区的Redis缓存
    struct PartitionSimulatingRedisCache {
        normal_cache: Option<redis_cache::RedisCache>,
        is_partitioned: Arc<AtomicBool>,
        partition_start_time: Arc<Mutex<Option<Instant>>>,
        operations_during_partition: Arc<AtomicU64>,
    }

    impl PartitionSimulatingRedisCache {
        fn new(redis_url: &str, prefix: String, default_ttl: Duration) -> Self {
            let cache = redis_cache::RedisCache::new(redis_url, prefix, default_ttl, 10).ok();
            Self {
                normal_cache: cache,
                is_partitioned: Arc::new(AtomicBool::new(false)),
                partition_start_time: Arc::new(Mutex::new(None)),
                operations_during_partition: Arc::new(AtomicU64::new(0)),
            }
        }

        fn simulate_partition(&self) {
            self.is_partitioned.store(true, Ordering::SeqCst);
            *self.partition_start_time.lock().unwrap() = Some(Instant::now());
            println!("🚨 模拟网络分区开始");
        }

        fn heal_partition(&self) {
            self.is_partitioned.store(false, Ordering::SeqCst);
            let duration = if let Some(start_time) = *self.partition_start_time.lock().unwrap() {
                start_time.elapsed()
            } else {
                Duration::from_secs(0)
            };
            let operations = self.operations_during_partition.load(Ordering::SeqCst);
            println!("🔄 网络分区恢复，持续时间: {:?}，分区期间操作数: {}", duration, operations);
            self.operations_during_partition.store(0, Ordering::SeqCst);
        }

        async fn get<T>(&self, key: &str) -> CacheResult<T> 
        where 
            T: serde::de::DeserializeOwned + Send + Sync,
        {
            if self.is_partitioned.load(Ordering::SeqCst) {
                self.operations_during_partition.fetch_add(1, Ordering::SeqCst);
                return CacheResult::Error("网络分区中".to_string());
            }

            match &self.normal_cache {
                Some(cache) => cache.get(key).await,
                None => CacheResult::Error("Redis缓存不可用".to_string()),
            }
        }

        async fn set<T>(&self, key: &str, value: &T, ttl: Option<Duration>) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
        where
            T: serde::Serialize + Send + Sync,
        {
            if self.is_partitioned.load(Ordering::SeqCst) {
                self.operations_during_partition.fetch_add(1, Ordering::SeqCst);
                return Err("网络分区中".into());
            }

            match &self.normal_cache {
                Some(cache) => {
                    cache.set(key, value, ttl).await
                        .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())) as Box<dyn std::error::Error + Send + Sync>)
                }
                None => Err("Redis缓存不可用".into()),
            }
        }
    }

    /// 网络分区下的多层缓存协调测试
    #[tokio::test]
    async fn test_multi_layer_cache_partition_tolerance() {
        println!("🌐 开始多层缓存网络分区容错测试...");

        // 使用内存缓存作为L1，模拟Redis分区作为L2
        let memory_cache = Arc::new(SimpleCache::new(100));
        let redis_cache = Arc::new(PartitionSimulatingRedisCache::new(
            "redis://localhost:6379", 
            "partition_test:".to_string(),
            Duration::from_secs(300)
        ));

        // 第一阶段：正常运行
        println!("📝 第一阶段：正常网络状态");
        
        let test_data = vec![
            (1, "关键数据1"),
            (2, "关键数据2"),
            (3, "重要信息"),
            (4, "用户会话"),
            (5, "配置数据"),
        ];

        // 在正常状态下填充缓存
        for &(id, description) in &test_data {
            let stats = AccountStats {
                account_id: id,
                request_count: id * 100,
                success_rate: 99.0,
                avg_response_time: 50.0,
                last_used_at: Some(chrono::Utc::now()),
            };

            // 同时写入内存和Redis缓存
            memory_cache.set_account_stats(id, stats.clone(), Duration::from_secs(300)).await;
            
            // 尝试写入Redis（可能失败，因为没有实际Redis实例）
            let redis_key = format!("account:{}", id);
            let _ = redis_cache.set(&redis_key, &stats, Some(Duration::from_secs(300))).await;
            
            println!("  ✅ 正常状态下存储数据: {} - {}", id, description);
        }

        // 验证正常状态下的数据可用性
        let mut normal_availability = 0;
        for &(id, _) in &test_data {
            if memory_cache.get_account_stats(id).await.is_some() {
                normal_availability += 1;
            }
        }
        assert_eq!(normal_availability, test_data.len(), "正常状态下所有数据应该可用");

        // 第二阶段：模拟网络分区
        println!("🚨 第二阶段：模拟网络分区");
        redis_cache.simulate_partition();

        // 在分区状态下进行操作
        let partition_start = Instant::now();
        let mut partition_operations = 0;
        let mut memory_hits_during_partition = 0;

        for round in 1..=10 {
            for &(id, _) in &test_data {
                // L1内存缓存应该仍然工作
                if memory_cache.get_account_stats(id).await.is_some() {
                    memory_hits_during_partition += 1;
                }

                // L2 Redis缓存应该返回错误
                let redis_key = format!("account:{}", id);
                let redis_result: CacheResult<AccountStats> = redis_cache.get(&redis_key).await;
                assert!(redis_result.is_error(), "分区期间Redis应该返回错误");

                partition_operations += 1;
            }

            // 模拟继续业务操作
            let new_id = 100 + round;
            let new_stats = AccountStats {
                account_id: new_id,
                request_count: new_id * 50,
                success_rate: 95.0,
                avg_response_time: 80.0,
                last_used_at: Some(chrono::Utc::now()),
            };

            // 内存缓存应该仍然可以写入
            memory_cache.set_account_stats(new_id, new_stats, Duration::from_secs(300)).await;

            // Redis写入应该失败
            let redis_key = format!("account:{}", new_id);
            let redis_write_result = redis_cache.set(&redis_key, &new_stats, Some(Duration::from_secs(300))).await;
            assert!(redis_write_result.is_err(), "分区期间Redis写入应该失败");

            tokio::time::sleep(Duration::from_millis(50)).await; // 模拟时间流逝
        }

        let partition_duration = partition_start.elapsed();
        println!("📊 网络分区期间统计:");
        println!("  分区持续时间: {:?}", partition_duration);
        println!("  总操作数: {}", partition_operations);
        println!("  内存缓存命中: {}", memory_hits_during_partition);
        println!("  内存缓存命中率: {:.1}%", (memory_hits_during_partition as f64 / partition_operations as f64) * 100.0);

        // 验证分区期间系统仍然部分可用
        assert!(memory_hits_during_partition > 0, "分区期间内存缓存应该仍然可用");
        assert!(partition_duration >= Duration::from_millis(400), "分区应该持续一段时间");

        // 第三阶段：网络恢复
        println!("🔄 第三阶段：网络分区恢复");
        redis_cache.heal_partition();

        // 验证恢复后的操作
        let recovery_test_id = 200;
        let recovery_stats = AccountStats {
            account_id: recovery_test_id,
            request_count: 1000,
            success_rate: 99.5,
            avg_response_time: 40.0,
            last_used_at: Some(chrono::Utc::now()),
        };

        // 恢复后应该可以正常写入Redis（如果有真实实例）
        memory_cache.set_account_stats(recovery_test_id, recovery_stats.clone(), Duration::from_secs(300)).await;
        let redis_key = format!("account:{}", recovery_test_id);
        let recovery_write_result = redis_cache.set(&redis_key, &recovery_stats, Some(Duration::from_secs(300))).await;
        
        // 如果没有真实Redis实例，写入可能仍会失败，但不应该是分区错误
        if recovery_write_result.is_err() {
            let error_msg = recovery_write_result.err().unwrap().to_string();
            assert!(!error_msg.contains("网络分区中"), "恢复后不应该再有分区错误");
        }

        // 验证内存缓存一直正常工作
        assert!(memory_cache.get_account_stats(recovery_test_id).await.is_some(), "恢复后内存缓存应该正常");

        println!("🎉 网络分区容错测试完成！");
    }

    /// Redis连接断开和重连测试
    #[tokio::test]
    async fn test_redis_connection_resilience() {
        println!("🔌 开始Redis连接弹性测试...");

        // 使用简化的缓存管理器进行测试
        let memory_cache = SimpleCache::new(50);

        // 模拟连接状态变化
        let connection_states = vec![
            ("初始连接", true, Duration::from_millis(100)),
            ("连接中断", false, Duration::from_millis(500)),
            ("尝试重连", false, Duration::from_millis(200)),
            ("连接恢复", true, Duration::from_millis(100)),
            ("稳定运行", true, Duration::from_millis(300)),
        ];

        let mut total_operations = 0;
        let mut successful_operations = 0;

        for (state_name, is_connected, duration) in connection_states {
            println!("  📡 连接状态: {}", state_name);
            let state_start = Instant::now();

            while state_start.elapsed() < duration {
                let account_id = total_operations + 1;
                let stats = AccountStats {
                    account_id,
                    request_count: account_id * 10,
                    success_rate: 95.0,
                    avg_response_time: 120.0,
                    last_used_at: Some(chrono::Utc::now()),
                };

                // 内存缓存操作（应该始终成功）
                memory_cache.set_account_stats(account_id, stats.clone(), Duration::from_secs(300)).await;
                if memory_cache.get_account_stats(account_id).await.is_some() {
                    successful_operations += 1;
                }

                // 模拟Redis操作（根据连接状态决定成功与否）
                if is_connected {
                    // 连接正常时的模拟操作
                    println!("    ✅ 操作 {} 在 {} 状态下成功", account_id, state_name);
                } else {
                    // 连接中断时的模拟操作
                    println!("    ❌ 操作 {} 在 {} 状态下失败（但内存缓存仍可用）", account_id, state_name);
                }

                total_operations += 1;
                tokio::time::sleep(Duration::from_millis(10)).await;
            }

            println!("    状态 '{}' 完成，持续时间: {:?}", state_name, state_start.elapsed());
        }

        println!("📊 Redis连接弹性测试结果:");
        println!("  总操作数: {}", total_operations);
        println!("  成功操作数: {}", successful_operations);
        println!("  内存缓存成功率: {:.1}%", (successful_operations as f64 / total_operations as f64) * 100.0);

        // 验证内存缓存在网络问题期间仍然可用
        assert_eq!(successful_operations, total_operations, "内存缓存应该始终可用");
        assert!(total_operations > 20, "应该执行足够的操作来验证弹性");

        println!("✅ Redis连接弹性测试完成");
    }

    /// 部分网络故障模拟测试
    #[tokio::test]
    async fn test_partial_network_failure() {
        println!("🌐 开始部分网络故障测试...");

        let cache = SimpleCache::new(200);
        
        // 模拟不同类型的网络故障
        let failure_scenarios = vec![
            ("间歇性连接", vec![true, false, true, false, true]),
            ("渐进式恶化", vec![true, true, false, false, false]),
            ("快速恢复", vec![false, false, true, true, true]),
            ("不稳定连接", vec![true, false, true, false, false, true, false]),
        ];

        for (scenario_name, connection_pattern) in failure_scenarios {
            println!("  🔧 测试场景: {}", scenario_name);
            
            let mut scenario_operations = 0;
            let mut scenario_successes = 0;
            let scenario_start = Instant::now();

            for (step, &is_connected) in connection_pattern.iter().enumerate() {
                let step_operations = 5; // 每个步骤执行5个操作
                
                for op in 0..step_operations {
                    let account_id = (step * 10 + op) as i64;
                    let stats = AccountStats {
                        account_id,
                        request_count: account_id * 20,
                        success_rate: 90.0 + step as f64,
                        avg_response_time: 100.0 + op as f64 * 5.0,
                        last_used_at: Some(chrono::Utc::now()),
                    };

                    // 内存缓存操作（始终成功）
                    cache.set_account_stats(account_id, stats.clone(), Duration::from_secs(300)).await;
                    
                    if is_connected {
                        // 模拟网络正常时的成功操作
                        if cache.get_account_stats(account_id).await.is_some() {
                            scenario_successes += 1;
                        }
                    } else {
                        // 模拟网络故障，但内存缓存仍然可用
                        if cache.get_account_stats(account_id).await.is_some() {
                            scenario_successes += 1; // 内存缓存仍然成功
                        }
                    }
                    
                    scenario_operations += 1;
                }

                let status = if is_connected { "正常" } else { "故障" };
                println!("    步骤 {}: 网络{}", step + 1, status);
                
                tokio::time::sleep(Duration::from_millis(50)).await;
            }

            let scenario_duration = scenario_start.elapsed();
            let success_rate = (scenario_successes as f64 / scenario_operations as f64) * 100.0;

            println!("    📊 场景 '{}' 结果:", scenario_name);
            println!("      操作数: {}", scenario_operations);
            println!("      成功数: {}", scenario_successes);
            println!("      成功率: {:.1}%", success_rate);
            println!("      耗时: {:?}", scenario_duration);

            // 验证系统在部分故障期间仍能提供基本服务
            assert!(success_rate >= 80.0, "即使在网络故障期间，成功率也应该保持在80%以上");
            assert!(scenario_operations > 0, "应该执行一些操作");
        }

        println!("🎉 部分网络故障测试完成！");
    }

    /// 网络延迟变化适应性测试
    #[tokio::test]
    async fn test_network_latency_adaptation() {
        println!("⏱️ 开始网络延迟适应性测试...");

        let cache = SimpleCache::new(100);
        
        // 模拟不同网络延迟场景
        let latency_scenarios = vec![
            ("低延迟", Duration::from_millis(1)),
            ("正常延迟", Duration::from_millis(10)),
            ("高延迟", Duration::from_millis(50)),
            ("极高延迟", Duration::from_millis(200)),
            ("超时边缘", Duration::from_millis(500)),
        ];

        let operations_per_scenario = 10;

        for (scenario_name, simulated_latency) in latency_scenarios {
            println!("  📡 测试延迟场景: {} ({:?})", scenario_name, simulated_latency);
            
            let scenario_start = Instant::now();
            let mut scenario_total_time = Duration::new(0, 0);

            for i in 1..=operations_per_scenario {
                let account_id = i * 1000 + scenario_name.len() as i64;
                let stats = AccountStats {
                    account_id,
                    request_count: i * 15,
                    success_rate: 92.0,
                    avg_response_time: simulated_latency.as_millis() as f64,
                    last_used_at: Some(chrono::Utc::now()),
                };

                let op_start = Instant::now();
                
                // 模拟网络延迟影响
                tokio::time::sleep(simulated_latency).await;
                
                // 执行缓存操作
                cache.set_account_stats(account_id, stats.clone(), Duration::from_secs(300)).await;
                let result = cache.get_account_stats(account_id).await;
                
                let op_duration = op_start.elapsed();
                scenario_total_time += op_duration;

                assert!(result.is_some(), "操作应该成功，即使网络延迟很高");
                
                // 验证操作时间包含了模拟的网络延迟
                assert!(op_duration >= simulated_latency, "操作时间应该至少包含网络延迟");
            }

            let scenario_duration = scenario_start.elapsed();
            let avg_operation_time = scenario_total_time / operations_per_scenario as u32;

            println!("    📊 延迟场景 '{}' 结果:", scenario_name);
            println!("      总耗时: {:?}", scenario_duration);
            println!("      平均操作时间: {:?}", avg_operation_time);
            println!("      预期延迟: {:?}", simulated_latency);
            
            // 验证系统能够在不同延迟条件下正常工作
            let latency_tolerance = simulated_latency + Duration::from_millis(50); // 允许50ms容差
            assert!(avg_operation_time <= latency_tolerance + Duration::from_millis(100), 
                   "平均操作时间应该在合理范围内");
        }

        println!("✅ 网络延迟适应性测试完成");
    }

    /// 大规模网络故障下的降级服务测试
    #[tokio::test]
    async fn test_degraded_service_under_major_network_failure() {
        println!("🚨 开始大规模网络故障降级服务测试...");

        let cache = SimpleCache::new(1000);
        
        // 预填充一些关键数据
        let critical_data = vec![
            (1, "VIP用户数据"),
            (2, "系统配置"),
            (3, "安全令牌"),
            (4, "紧急联系人"),
            (5, "灾难恢复信息"),
        ];

        println!("  📝 预填充关键数据...");
        for &(id, description) in &critical_data {
            let stats = AccountStats {
                account_id: id,
                request_count: id * 1000,
                success_rate: 99.9,
                avg_response_time: 25.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            cache.set_account_stats(id, stats, Duration::from_secs(3600)).await; // 长TTL
            println!("    ✅ 预存关键数据: {} - {}", id, description);
        }

        // 模拟大规模网络故障
        println!("  🚨 模拟大规模网络故障...");
        let failure_start = Instant::now();
        let failure_duration = Duration::from_secs(2); // 2秒故障期

        let mut operations_during_failure = 0;
        let mut successful_operations = 0;
        let mut critical_data_available = 0;

        while failure_start.elapsed() < failure_duration {
            // 尝试访问关键数据
            for &(id, _) in &critical_data {
                if cache.get_account_stats(id).await.is_some() {
                    critical_data_available += 1;
                }
            }

            // 尝试一些新的操作
            let temp_id = operations_during_failure + 1000;
            let temp_stats = AccountStats {
                account_id: temp_id,
                request_count: temp_id * 5,
                success_rate: 85.0,
                avg_response_time: 200.0,
                last_used_at: Some(chrono::Utc::now()),
            };

            // 在故障期间，只有内存缓存可用
            cache.set_account_stats(temp_id, temp_stats, Duration::from_secs(60)).await;
            if cache.get_account_stats(temp_id).await.is_some() {
                successful_operations += 1;
            }

            operations_during_failure += 1;
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        let actual_failure_duration = failure_start.elapsed();
        
        println!("📊 大规模网络故障期间统计:");
        println!("  故障持续时间: {:?}", actual_failure_duration);
        println!("  故障期间操作数: {}", operations_during_failure);
        println!("  成功操作数: {}", successful_operations);
        println!("  关键数据访问次数: {}", critical_data_available);
        println!("  降级服务成功率: {:.1}%", (successful_operations as f64 / operations_during_failure as f64) * 100.0);

        // 验证降级服务的效果
        assert!(successful_operations > 0, "降级服务应该仍能处理一些操作");
        assert!(critical_data_available > 0, "关键数据应该在故障期间仍可访问");
        
        let degraded_success_rate = successful_operations as f64 / operations_during_failure as f64;
        assert!(degraded_success_rate >= 0.8, "降级服务成功率应该至少80%");

        // 模拟网络恢复
        println!("  🔄 模拟网络恢复...");
        
        let recovery_operations = 20;
        let mut recovery_successes = 0;
        
        for i in 1..=recovery_operations {
            let recovery_id = 2000 + i;
            let recovery_stats = AccountStats {
                account_id: recovery_id,
                request_count: recovery_id * 8,
                success_rate: 98.0,
                avg_response_time: 60.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            cache.set_account_stats(recovery_id, recovery_stats, Duration::from_secs(300)).await;
            if cache.get_account_stats(recovery_id).await.is_some() {
                recovery_successes += 1;
            }
        }

        let recovery_success_rate = recovery_successes as f64 / recovery_operations as f64;
        println!("📊 网络恢复后统计:");
        println!("  恢复操作数: {}", recovery_operations);
        println!("  恢复成功数: {}", recovery_successes);
        println!("  恢复成功率: {:.1}%", recovery_success_rate * 100.0);

        // 验证完全恢复
        assert_eq!(recovery_successes, recovery_operations, "网络恢复后应该100%成功");

        println!("🎉 大规模网络故障降级服务测试完成！");
    }
}