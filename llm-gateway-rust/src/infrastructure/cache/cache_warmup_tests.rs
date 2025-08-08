//! 缓存预热优化测试
//! 
//! 测试各种缓存预热策略和优化方案的效果

#[cfg(test)]
mod cache_warmup_tests {
    use super::super::*;
    use std::time::{Duration, Instant};
    use std::sync::{Arc, atomic::{AtomicU64, Ordering}};
    use tokio;
    use std::collections::HashMap;

    /// 智能预热策略测试
    #[tokio::test]
    async fn test_intelligent_warmup_strategy() {
        println!("🔥 开始智能预热策略测试...");

        let cache = Arc::new(SimpleCache::new(1000));
        
        // 模拟不同优先级的数据
        let warmup_priorities = vec![
            (1, "关键业务数据", 10, Duration::from_secs(3600)),      // 高优先级，长TTL
            (2, "热门用户数据", 8, Duration::from_secs(1800)),       // 高优先级，中TTL
            (3, "常用配置", 7, Duration::from_secs(7200)),           // 中高优先级，长TTL
            (4, "统计报告", 5, Duration::from_secs(900)),            // 中优先级，短TTL
            (5, "临时会话", 3, Duration::from_secs(300)),            // 低优先级，短TTL
            (6, "历史数据", 2, Duration::from_secs(1800)),           // 低优先级，中TTL
            (7, "缓存元数据", 1, Duration::from_secs(600)),          // 最低优先级，短TTL
        ];

        println!("  📋 数据优先级策略:");
        for &(level, description, priority, ttl) in &warmup_priorities {
            println!("    级别 {}: {} (优先级: {}, TTL: {:?})", level, description, priority, ttl);
        }

        // 第一阶段：按优先级顺序预热
        println!("  🚀 第一阶段：按优先级预热...");
        let warmup_start = Instant::now();

        // 按优先级从高到低排序
        let mut sorted_priorities = warmup_priorities.clone();
        sorted_priorities.sort_by(|a, b| b.2.cmp(&a.2)); // 按优先级降序

        let mut warmup_stats = HashMap::new();

        for &(level, description, priority, ttl) in &sorted_priorities {
            let level_start = Instant::now();
            let items_per_level = priority as usize * 10; // 高优先级预热更多数据
            
            for i in 1..=items_per_level {
                let account_id = (level * 1000 + i) as i64;
                let stats = AccountStats {
                    account_id,
                    request_count: account_id * priority as i64,
                    success_rate: 90.0 + priority as f64,
                    avg_response_time: 150.0 - priority as f64 * 10.0,
                    last_used_at: Some(chrono::Utc::now()),
                };
                
                cache.set_account_stats(account_id, stats, ttl).await;
            }
            
            let level_duration = level_start.elapsed();
            warmup_stats.insert(level, (items_per_level, level_duration));
            
            println!("    ✅ 级别 {} 预热完成: {} 项数据, 耗时 {:?}", 
                     level, items_per_level, level_duration);
        }

        let total_warmup_duration = warmup_start.elapsed();
        let total_items: usize = warmup_stats.values().map(|(count, _)| *count).sum();
        
        println!("📊 智能预热统计:");
        println!("  总预热时间: {:?}", total_warmup_duration);
        println!("  总预热数据量: {} 项", total_items);
        println!("  平均预热速度: {:.0} 项/秒", total_items as f64 / total_warmup_duration.as_secs_f64());

        // 第二阶段：验证预热效果
        println!("  🎯 第二阶段：验证预热效果...");
        let verification_start = Instant::now();
        
        let mut hit_stats = HashMap::new();
        
        for &(level, _, priority, _) in &warmup_priorities {
            let level_hits = Arc::new(AtomicU64::new(0));
            let level_total = Arc::new(AtomicU64::new(0));
            let items_count = warmup_stats[&level].0;
            
            // 随机访问该级别的数据
            let sample_size = std::cmp::min(items_count, 50); // 最多采样50个
            for i in 1..=sample_size {
                let account_id = (level * 1000 + i) as i64;
                level_total.fetch_add(1, Ordering::Relaxed);
                
                if cache.get_account_stats(account_id).await.is_some() {
                    level_hits.fetch_add(1, Ordering::Relaxed);
                }
            }
            
            let hits = level_hits.load(Ordering::Relaxed);
            let total = level_total.load(Ordering::Relaxed);
            let hit_rate = if total > 0 { hits as f64 / total as f64 } else { 0.0 };
            
            hit_stats.insert(level, (hits, total, hit_rate));
            println!("    📈 级别 {} 命中率: {:.1}% ({}/{})", 
                     level, hit_rate * 100.0, hits, total);
        }

        let verification_duration = verification_start.elapsed();
        
        // 验证预热效果：高优先级数据应该有更高的命中率
        let high_priority_hit_rate = hit_stats[&1].2; // 最高优先级
        let low_priority_hit_rate = hit_stats[&7].2;  // 最低优先级
        
        assert!(high_priority_hit_rate >= 0.9, "高优先级数据命中率应该≥90%");
        assert!(high_priority_hit_rate >= low_priority_hit_rate, "高优先级命中率应该≥低优先级");
        
        println!("📊 预热效果验证:");
        println!("  验证耗时: {:?}", verification_duration);
        println!("  高优先级命中率: {:.1}%", high_priority_hit_rate * 100.0);
        println!("  低优先级命中率: {:.1}%", low_priority_hit_rate * 100.0);
        
        println!("✅ 智能预热策略测试完成");
    }

    /// 批量预热性能测试
    #[tokio::test]
    async fn test_batch_warmup_performance() {
        println!("📦 开始批量预热性能测试...");

        let cache = Arc::new(SimpleCache::new(5000));
        
        // 测试不同批量大小的性能
        let batch_sizes = vec![1, 10, 50, 100, 500];
        let total_data_size = 1000;
        
        for &batch_size in &batch_sizes {
            println!("  🔄 测试批量大小: {}", batch_size);
            
            let batch_start = Instant::now();
            let mut batch_operations = 0;
            let batch_count = (total_data_size + batch_size - 1) / batch_size; // 向上取整
            
            for batch_id in 0..batch_count {
                let mut batch_handles = Vec::new();
                
                // 创建一个批次的操作
                for i in 0..batch_size {
                    let account_id = (batch_id * batch_size + i) as i64;
                    if account_id >= total_data_size as i64 { break; }
                    
                    let cache_clone = Arc::clone(&cache);
                    let handle = tokio::spawn(async move {
                        let stats = AccountStats {
                            account_id: account_id + 10000, // 避免ID冲突
                            request_count: account_id * 50,
                            success_rate: 95.0,
                            avg_response_time: 100.0 + (account_id as f64 * 0.1),
                            last_used_at: Some(chrono::Utc::now()),
                        };
                        
                        cache_clone.set_account_stats(
                            account_id + 10000, 
                            stats, 
                            Duration::from_secs(600)
                        ).await;
                    });
                    
                    batch_handles.push(handle);
                    batch_operations += 1;
                }
                
                // 等待批次完成
                for handle in batch_handles {
                    handle.await.expect("批次操作应该成功");
                }
                
                // 批量间的小延迟，避免过度并发
                if batch_size > 100 {
                    tokio::time::sleep(Duration::from_millis(1)).await;
                }
            }
            
            let batch_duration = batch_start.elapsed();
            let throughput = batch_operations as f64 / batch_duration.as_secs_f64();
            
            println!("    📊 批量大小 {} 结果:", batch_size);
            println!("      操作数: {}", batch_operations);
            println!("      耗时: {:?}", batch_duration);
            println!("      吞吐量: {:.0} ops/sec", throughput);
            
            // 验证吞吐量合理性
            assert!(throughput > 100.0, "批量操作吞吐量应该 > 100 ops/sec");
            assert!(batch_operations <= total_data_size, "操作数不应超过总数据量");
        }
        
        println!("✅ 批量预热性能测试完成");
    }

    /// 增量预热策略测试
    #[tokio::test]
    async fn test_incremental_warmup_strategy() {
        println!("📈 开始增量预热策略测试...");

        let cache = Arc::new(SimpleCache::new(2000));
        
        // 模拟数据访问频率分布（基于历史数据）
        let access_patterns = vec![
            (1..=10, "极热数据", 1000, Duration::from_secs(3600)),      // 访问频率极高
            (11..=50, "热数据", 500, Duration::from_secs(1800)),         // 访问频率高
            (51..=200, "温数据", 100, Duration::from_secs(900)),         // 访问频率中等
            (201..=500, "冷数据", 20, Duration::from_secs(300)),         // 访问频率低
            (501..=1000, "极冷数据", 5, Duration::from_secs(120)),       // 访问频率极低
        ];

        println!("  📊 访问模式分布:");
        for (range, description, freq, ttl) in &access_patterns {
            println!("    ID范围 {:?}: {} (预期访问频率: {}/小时, TTL: {:?})", 
                     range, description, freq, ttl);
        }

        // 第一阶段：增量预热
        println!("  🔄 第一阶段：执行增量预热...");
        
        let incremental_stages = vec![
            ("阶段1：极热数据", 1..=10, Duration::from_millis(0)),
            ("阶段2：热数据", 11..=50, Duration::from_millis(100)),
            ("阶段3：温数据", 51..=200, Duration::from_millis(500)),
            ("阶段4：冷数据", 201..=500, Duration::from_millis(1000)),
            ("阶段5：极冷数据", 501..=1000, Duration::from_millis(2000)),
        ];

        let mut stage_stats = Vec::new();
        let total_warmup_start = Instant::now();

        for (stage_name, id_range, delay_before) in incremental_stages {
            // 阶段间延迟
            if delay_before > Duration::from_millis(0) {
                println!("    ⏳ 等待 {:?} 后开始 {}", delay_before, stage_name);
                tokio::time::sleep(delay_before).await;
            }

            let stage_start = Instant::now();
            let mut stage_operations = 0;

            // 找到对应的访问模式
            let (_, _, _, ttl) = access_patterns.iter()
                .find(|(range, _, _, _)| range.start() <= id_range.start() && range.end() >= id_range.end())
                .unwrap_or(&(1..=1, "default", 100, Duration::from_secs(300)));

            println!("    🚀 开始 {}", stage_name);

            for account_id in id_range {
                let stats = AccountStats {
                    account_id,
                    request_count: account_id * 20,
                    success_rate: 95.0 + (account_id as f64 * 0.001),
                    avg_response_time: 120.0 - (account_id as f64 * 0.01).min(50.0),
                    last_used_at: Some(chrono::Utc::now()),
                };

                cache.set_account_stats(account_id, stats, *ttl).await;
                stage_operations += 1;

                // 在大批量操作中添加微小延迟
                if stage_operations % 100 == 0 {
                    tokio::time::sleep(Duration::from_micros(100)).await;
                }
            }

            let stage_duration = stage_start.elapsed();
            let stage_throughput = stage_operations as f64 / stage_duration.as_secs_f64();
            
            stage_stats.push((stage_name, stage_operations, stage_duration, stage_throughput));
            
            println!("    ✅ {} 完成: {} 项, 耗时 {:?}, 吞吐量 {:.0} ops/sec", 
                     stage_name, stage_operations, stage_duration, stage_throughput);
        }

        let total_warmup_duration = total_warmup_start.elapsed();
        let total_operations: i64 = stage_stats.iter().map(|(_, ops, _, _)| *ops).sum();

        println!("📊 增量预热总体统计:");
        println!("  总预热时间: {:?}", total_warmup_duration);
        println!("  总预热数据: {} 项", total_operations);
        println!("  总体吞吐量: {:.0} ops/sec", total_operations as f64 / total_warmup_duration.as_secs_f64());

        // 第二阶段：验证增量预热的效果
        println!("  🎯 第二阶段：验证增量预热效果...");

        let verification_start = Instant::now();
        let mut access_test_results = Vec::new();

        // 模拟实际访问模式
        for (id_range, description, expected_freq, _) in &access_patterns {
            let sample_size = std::cmp::min(id_range.len(), 20); // 每个范围采样20个
            let mut hits = 0;
            let mut total_accesses = 0;
            let access_start = Instant::now();

            for i in 0..sample_size {
                let account_id = id_range.start() + i as i64;
                total_accesses += 1;

                if cache.get_account_stats(account_id).await.is_some() {
                    hits += 1;
                }

                // 模拟不同频率的访问间隔
                let access_interval = Duration::from_millis(1000 / (expected_freq / 10).max(1) as u64);
                tokio::time::sleep(access_interval).await;
            }

            let access_duration = access_start.elapsed();
            let hit_rate = hits as f64 / total_accesses as f64;
            let access_speed = total_accesses as f64 / access_duration.as_secs_f64();

            access_test_results.push((*description, hit_rate, access_speed));
            
            println!("    📈 {} 验证: 命中率 {:.1}% ({}/{}), 访问速度 {:.0} req/sec", 
                     description, hit_rate * 100.0, hits, total_accesses, access_speed);
        }

        let verification_duration = verification_start.elapsed();

        // 验证增量预热的效果
        let hot_data_hit_rate = access_test_results[0].1; // 极热数据
        let cold_data_hit_rate = access_test_results[4].1; // 极冷数据

        println!("📊 增量预热效果分析:");
        println!("  验证总耗时: {:?}", verification_duration);
        println!("  极热数据命中率: {:.1}%", hot_data_hit_rate * 100.0);
        println!("  极冷数据命中率: {:.1}%", cold_data_hit_rate * 100.0);
        println!("  命中率梯度: {:.2}", hot_data_hit_rate / cold_data_hit_rate.max(0.01));

        // 断言验证
        assert!(hot_data_hit_rate >= 0.95, "极热数据命中率应该 ≥ 95%");
        assert!(hot_data_hit_rate >= cold_data_hit_rate, "热数据命中率应该 ≥ 冷数据");
        assert!(total_operations >= 1000, "应该预热足够的数据");

        println!("✅ 增量预热策略测试完成");
    }

    /// 自适应预热算法测试
    #[tokio::test]
    async fn test_adaptive_warmup_algorithm() {
        println!("🧠 开始自适应预热算法测试...");

        let cache = Arc::new(SimpleCache::new(1500));
        
        // 模拟系统负载和资源状况
        struct SystemMetrics {
            cpu_usage: f64,
            memory_usage: f64,
            network_latency: Duration,
            cache_hit_rate: f64,
        }

        let system_conditions = vec![
            ("低负载", SystemMetrics { cpu_usage: 20.0, memory_usage: 30.0, network_latency: Duration::from_millis(5), cache_hit_rate: 0.6 }),
            ("中等负载", SystemMetrics { cpu_usage: 60.0, memory_usage: 70.0, network_latency: Duration::from_millis(15), cache_hit_rate: 0.75 }),
            ("高负载", SystemMetrics { cpu_usage: 85.0, memory_usage: 90.0, network_latency: Duration::from_millis(50), cache_hit_rate: 0.85 }),
            ("峰值负载", SystemMetrics { cpu_usage: 95.0, memory_usage: 95.0, network_latency: Duration::from_millis(100), cache_hit_rate: 0.90 }),
        ];

        for (condition_name, metrics) in system_conditions {
            println!("  🖥️ 测试系统条件: {}", condition_name);
            println!("    CPU: {:.1}%, 内存: {:.1}%, 网络延迟: {:?}, 缓存命中率: {:.1}%", 
                     metrics.cpu_usage, metrics.memory_usage, metrics.network_latency, metrics.cache_hit_rate * 100.0);

            // 根据系统状况调整预热策略
            let (warmup_batch_size, warmup_concurrency, warmup_interval) = match condition_name {
                "低负载" => (100, 10, Duration::from_millis(1)),      // 激进预热
                "中等负载" => (50, 5, Duration::from_millis(10)),      // 平衡预热
                "高负载" => (20, 2, Duration::from_millis(50)),        // 保守预热
                "峰值负载" => (10, 1, Duration::from_millis(100)),     // 最小预热
                _ => (50, 5, Duration::from_millis(10)),
            };

            println!("    📋 自适应策略: 批量大小 {}, 并发数 {}, 间隔 {:?}", 
                     warmup_batch_size, warmup_concurrency, warmup_interval);

            let condition_start = Instant::now();
            let mut total_warmed = 0;
            let warmup_rounds = 10;

            for round in 1..=warmup_rounds {
                let round_start = Instant::now();
                let mut round_handles = Vec::new();

                // 创建并发预热任务
                for worker_id in 0..warmup_concurrency {
                    let cache_clone = Arc::clone(&cache);
                    let base_id = round * 1000 + worker_id * 100;
                    
                    let handle = tokio::spawn(async move {
                        let mut worker_operations = 0;
                        
                        for i in 0..warmup_batch_size {
                            let account_id = base_id + i;
                            let stats = AccountStats {
                                account_id: account_id as i64,
                                request_count: account_id as i64 * 15,
                                success_rate: 94.0 + (worker_id as f64 * 0.5),
                                avg_response_time: 110.0 + (i as f64 * 0.2),
                                last_used_at: Some(chrono::Utc::now()),
                            };
                            
                            cache_clone.set_account_stats(
                                account_id as i64, 
                                stats, 
                                Duration::from_secs(600)
                            ).await;
                            worker_operations += 1;
                        }
                        
                        worker_operations
                    });
                    
                    round_handles.push(handle);
                }

                // 等待当前轮完成
                for handle in round_handles {
                    let operations = handle.await.expect("预热任务应该成功");
                    total_warmed += operations;
                }

                let round_duration = round_start.elapsed();
                
                // 自适应间隔调整
                tokio::time::sleep(warmup_interval).await;
                
                if round % 3 == 0 {
                    println!("    🔄 第 {} 轮预热完成，耗时 {:?}", round, round_duration);
                }
            }

            let condition_duration = condition_start.elapsed();
            let condition_throughput = total_warmed as f64 / condition_duration.as_secs_f64();

            println!("    📊 {} 预热结果:", condition_name);
            println!("      预热数据量: {}", total_warmed);
            println!("      总耗时: {:?}", condition_duration);
            println!("      吞吐量: {:.0} ops/sec", condition_throughput);

            // 验证自适应效果
            let expected_min_throughput = match condition_name {
                "低负载" => 2000.0,
                "中等负载" => 1000.0,
                "高负载" => 400.0,
                "峰值负载" => 100.0,
                _ => 500.0,
            };

            assert!(condition_throughput >= expected_min_throughput, 
                   "{} 条件下吞吐量应该 ≥ {} ops/sec", condition_name, expected_min_throughput);
            assert!(total_warmed > 0, "应该预热一些数据");
        }

        println!("✅ 自适应预热算法测试完成");
    }

    /// 预热效果持久性测试
    #[tokio::test]
    async fn test_warmup_persistence_effectiveness() {
        println!("⏰ 开始预热效果持久性测试...");

        let cache = Arc::new(SimpleCache::new(800));
        
        // 预热数据，设置不同的TTL
        let persistence_test_data = vec![
            (1..=100, "短期数据", Duration::from_millis(500)),
            (101..=300, "中期数据", Duration::from_secs(2)),
            (301..=500, "长期数据", Duration::from_secs(10)),
        ];

        println!("  📝 预热不同持久性的数据...");
        let warmup_start = Instant::now();

        for (id_range, description, ttl) in &persistence_test_data {
            let category_start = Instant::now();
            let mut category_count = 0;

            for account_id in id_range.clone() {
                let stats = AccountStats {
                    account_id,
                    request_count: account_id * 25,
                    success_rate: 96.0,
                    avg_response_time: 95.0,
                    last_used_at: Some(chrono::Utc::now()),
                };

                cache.set_account_stats(account_id, stats, *ttl).await;
                category_count += 1;
            }

            let category_duration = category_start.elapsed();
            println!("    ✅ {} 预热完成: {} 项, TTL {:?}, 耗时 {:?}", 
                     description, category_count, ttl, category_duration);
        }

        let total_warmup_duration = warmup_start.elapsed();
        println!("📊 预热完成，总耗时: {:?}", total_warmup_duration);

        // 时间序列测试：在不同时间点检查数据可用性
        let test_intervals = vec![
            Duration::from_millis(100),
            Duration::from_millis(600),  // 短期数据应该过期
            Duration::from_secs(3),      // 中期数据应该过期  
            Duration::from_secs(12),     // 长期数据应该过期
        ];

        let mut persistence_results = Vec::new();

        for (test_point, interval) in test_intervals.iter().enumerate() {
            println!("  ⏱️ 等待 {:?} 后测试数据持久性...", interval);
            tokio::time::sleep(*interval).await;

            let test_start = Instant::now();
            let mut availability_stats = Vec::new();

            for (id_range, description, expected_ttl) in &persistence_test_data {
                let sample_size = std::cmp::min(id_range.len(), 30);
                let mut available_count = 0;

                for i in 0..sample_size {
                    let account_id = id_range.start() + i as i64;
                    if cache.get_account_stats(account_id).await.is_some() {
                        available_count += 1;
                    }
                }

                let availability_rate = available_count as f64 / sample_size as f64;
                let should_be_available = *interval < *expected_ttl;
                
                availability_stats.push((description, availability_rate, should_be_available));
                
                let status = if should_be_available && availability_rate > 0.8 {
                    "✅ 符合预期"
                } else if !should_be_available && availability_rate < 0.2 {
                    "✅ 符合预期(已过期)"
                } else {
                    "⚠️ 部分过期"
                };

                println!("    📈 {} 可用性: {:.1}% ({}/{}), {}", 
                         description, availability_rate * 100.0, available_count, sample_size, status);
            }

            let test_duration = test_start.elapsed();
            persistence_results.push((test_point, *interval, availability_stats, test_duration));
        }

        // 分析持久性效果
        println!("📊 预热持久性效果分析:");
        
        for (test_point, interval, stats, duration) in persistence_results {
            println!("  测试点 {} (+{:?}):", test_point + 1, interval);
            
            for (description, availability, should_be_available) in stats {
                let effectiveness = if should_be_available {
                    availability
                } else {
                    1.0 - availability // 过期后低可用性是好事
                };
                
                println!("    {} 有效性: {:.1}%", description, effectiveness * 100.0);
                
                // 验证TTL行为的正确性
                if should_be_available {
                    assert!(availability >= 0.5, "{} 在TTL内应该大部分可用", description);
                }
            }
            
            println!("    测试耗时: {:?}", duration);
        }

        println!("✅ 预热效果持久性测试完成");
    }
}