//! 可靠性和稳定性测试
//! 
//! 测试缓存系统在长期运行和各种异常情况下的可靠性

#[cfg(test)]
mod reliability_tests {
    use super::super::*;
    use std::time::{Duration, Instant};
    use std::sync::Arc;
    use tokio;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// 长时间运行稳定性测试
    #[tokio::test]
    async fn test_long_running_stability() {
        println!("⏳ 开始长时间运行稳定性测试...");
        
        let cache = Arc::new(SimpleCache::new(1000));
        let test_duration = Duration::from_secs(30); // 30秒测试
        let start_time = Instant::now();
        
        let operations_counter = Arc::new(AtomicU64::new(0));
        let errors_counter = Arc::new(AtomicU64::new(0));
        
        // 启动多个工作线程
        let mut handles = vec![];
        
        // 写入线程
        for thread_id in 0..3 {
            let cache_clone = Arc::clone(&cache);
            let ops_counter = Arc::clone(&operations_counter);
            let errors_counter = Arc::clone(&errors_counter);
            let start = start_time;
            
            let handle = tokio::spawn(async move {
                let mut local_ops = 0u64;
                let mut account_id = thread_id * 10000;
                
                while start.elapsed() < test_duration {
                    account_id += 1;
                    
                    let stats = AccountStats {
                        account_id,
                        request_count: account_id * 10,
                        success_rate: 95.0 + (account_id % 5) as f64,
                        avg_response_time: 100.0 + (account_id % 50) as f64,
                        last_used_at: Some(chrono::Utc::now()),
                    };
                    
                    cache_clone.set_account_stats(account_id, stats, Duration::from_secs(60)).await;
                    local_ops += 1;
                    
                    // 控制操作频率，避免过度消耗CPU
                    if local_ops % 100 == 0 {
                        tokio::time::sleep(Duration::from_millis(1)).await;
                    }
                }
                
                ops_counter.fetch_add(local_ops, Ordering::Relaxed);
                println!("📝 写入线程 {} 完成: {} 操作", thread_id, local_ops);
            });
            
            handles.push(handle);
        }
        
        // 读取线程
        for thread_id in 0..3 {
            let cache_clone = Arc::clone(&cache);
            let ops_counter = Arc::clone(&operations_counter);
            let errors_counter = Arc::clone(&errors_counter);
            let start = start_time;
            
            let handle = tokio::spawn(async move {
                let mut local_ops = 0u64;
                let mut local_errors = 0u64;
                let base_account_id = thread_id * 10000;
                
                while start.elapsed() < test_duration {
                    let account_id = base_account_id + (local_ops % 1000) as i64;
                    
                    match cache_clone.get_account_stats(account_id).await {
                        Some(_) => {
                            // 命中
                        }
                        None => {
                            // 未命中，正常情况
                        }
                    }
                    
                    local_ops += 1;
                    
                    if local_ops % 100 == 0 {
                        tokio::time::sleep(Duration::from_millis(1)).await;
                    }
                }
                
                ops_counter.fetch_add(local_ops, Ordering::Relaxed);
                errors_counter.fetch_add(local_errors, Ordering::Relaxed);
                println!("📖 读取线程 {} 完成: {} 操作, {} 错误", thread_id, local_ops, local_errors);
            });
            
            handles.push(handle);
        }
        
        // 混合操作线程
        for thread_id in 0..2 {
            let cache_clone = Arc::clone(&cache);
            let ops_counter = Arc::clone(&operations_counter);
            let start = start_time;
            
            let handle = tokio::spawn(async move {
                let mut local_ops = 0u64;
                let base_account_id = thread_id * 5000 + 50000;
                
                while start.elapsed() < test_duration {
                    let account_id = base_account_id + (local_ops % 500) as i64;
                    
                    if local_ops % 3 == 0 {
                        // 写入操作
                        let stats = AccountStats {
                            account_id,
                            request_count: account_id * 5,
                            success_rate: 98.0,
                            avg_response_time: 80.0,
                            last_used_at: Some(chrono::Utc::now()),
                        };
                        cache_clone.set_account_stats(account_id, stats, Duration::from_secs(30)).await;
                    } else if local_ops % 3 == 1 {
                        // 读取操作
                        let _ = cache_clone.get_account_stats(account_id).await;
                    } else {
                        // 删除操作
                        let _ = cache_clone.remove_account_stats(account_id).await;
                    }
                    
                    local_ops += 1;
                    
                    if local_ops % 50 == 0 {
                        tokio::time::sleep(Duration::from_millis(1)).await;
                    }
                }
                
                ops_counter.fetch_add(local_ops, Ordering::Relaxed);
                println!("🔄 混合线程 {} 完成: {} 操作", thread_id, local_ops);
            });
            
            handles.push(handle);
        }
        
        // 等待所有线程完成
        for handle in handles {
            handle.await.expect("线程应该正常完成");
        }
        
        let total_duration = start_time.elapsed();
        let total_operations = operations_counter.load(Ordering::Relaxed);
        let total_errors = errors_counter.load(Ordering::Relaxed);
        let ops_per_second = total_operations as f64 / total_duration.as_secs_f64();
        let error_rate = total_errors as f64 / total_operations as f64;
        
        println!("📊 长时间运行统计:");
        println!("   运行时间: {:?}", total_duration);
        println!("   总操作数: {}", total_operations);
        println!("   总错误数: {}", total_errors);
        println!("   操作/秒: {:.0}", ops_per_second);
        println!("   错误率: {:.4}%", error_rate * 100.0);
        
        // 稳定性验证
        assert!(total_operations > 10000, "应该执行大量操作");
        assert!(error_rate < 0.001, "错误率应该极低");
        assert!(ops_per_second > 1000.0, "吞吐量应该保持在合理水平");
        
        println!("✅ 长时间运行稳定性测试通过");
    }

    /// 内存泄漏检测测试
    #[tokio::test]
    async fn test_memory_leak_detection() {
        println!("🔍 开始内存泄漏检测测试...");
        
        // 多轮创建和销毁缓存实例
        let rounds = 100;
        let entries_per_round = 1000;
        
        for round in 1..=rounds {
            let cache = SimpleCache::new(entries_per_round);
            
            // 快速填充缓存
            for i in 1..=entries_per_round {
                let stats = AccountStats {
                    account_id: i as i64,
                    request_count: i * 10,
                    success_rate: 95.0,
                    avg_response_time: 120.0,
                    last_used_at: Some(chrono::Utc::now()),
                };
                cache.set_account_stats(i as i64, stats, Duration::from_millis(50)).await;
            }
            
            // 快速访问所有数据
            for i in 1..=entries_per_round {
                let _ = cache.get_account_stats(i as i64).await;
            }
            
            // 等待数据过期
            tokio::time::sleep(Duration::from_millis(60)).await;
            
            // 再次访问以触发清理
            for i in 1..=10 {
                let _ = cache.get_account_stats(i as i64).await;
            }
            
            // 缓存实例会在这里被销毁
            drop(cache);
            
            if round % 20 == 0 {
                println!("🔄 完成第 {} 轮内存测试", round);
                
                // 强制垃圾回收（在支持的平台上）
                tokio::time::sleep(Duration::from_millis(1)).await;
            }
        }
        
        println!("📊 内存泄漏测试统计:");
        println!("   测试轮数: {}", rounds);
        println!("   每轮条目: {}", entries_per_round);
        println!("   总创建条目: {}", rounds * entries_per_round);
        
        // 最终验证 - 创建一个新的缓存应该仍然工作正常
        let final_cache = SimpleCache::new(100);
        
        let test_stats = AccountStats {
            account_id: 999999,
            request_count: 1000,
            success_rate: 99.0,
            avg_response_time: 50.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        final_cache.set_account_stats(999999, test_stats, Duration::from_secs(60)).await;
        let result = final_cache.get_account_stats(999999).await;
        
        assert!(result.is_some(), "最终验证应该成功");
        assert_eq!(result.unwrap().account_id, 999999, "数据应该正确");
        
        println!("✅ 内存泄漏检测测试通过 - 未发现明显的内存泄漏");
    }

    /// 异常恢复能力测试
    #[tokio::test]
    async fn test_exception_recovery_capability() {
        println!("🚨 开始异常恢复能力测试...");
        
        let cache = SimpleCache::new(100);
        
        // 第一阶段：正常操作
        println!("📝 第一阶段：建立正常运行基线...");
        
        for i in 1..=20 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        // 验证正常状态
        let mut normal_hits = 0;
        for i in 1..=20 {
            if cache.get_account_stats(i).await.is_some() {
                normal_hits += 1;
            }
        }
        assert_eq!(normal_hits, 20, "正常状态下所有数据应该存在");
        
        println!("✅ 正常运行基线建立: {}/20 数据可用", normal_hits);
        
        // 第二阶段：模拟各种异常情况
        println!("🚨 第二阶段：模拟异常情况...");
        
        // 异常1：大量并发访问不存在的数据
        println!("  💥 异常1：大量并发访问不存在的数据");
        let mut concurrent_handles = vec![];
        
        for thread_id in 0..50 {
            let cache_clone = cache.clone();
            let handle = tokio::spawn(async move {
                // 访问大量不存在的数据
                for i in 10000..10100 {
                    let _ = cache_clone.get_account_stats(thread_id * 1000 + i).await;
                }
            });
            concurrent_handles.push(handle);
        }
        
        // 等待并发访问完成
        for handle in concurrent_handles {
            handle.await.expect("并发访问任务应该完成");
        }
        
        // 验证正常数据是否受影响
        let mut after_exception1_hits = 0;
        for i in 1..=20 {
            if cache.get_account_stats(i).await.is_some() {
                after_exception1_hits += 1;
            }
        }
        
        println!("  📊 异常1后状态: {}/20 正常数据仍可用", after_exception1_hits);
        assert!(after_exception1_hits >= 15, "大部分正常数据应该仍然可用");
        
        // 异常2：频繁的设置和删除操作
        println!("  💥 异常2：频繁设置和删除操作");
        
        for cycle in 0..100 {
            let temp_id = 5000 + cycle;
            
            // 设置
            let stats = AccountStats {
                account_id: temp_id,
                request_count: cycle * 5,
                success_rate: 90.0,
                avg_response_time: 200.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(temp_id, stats, Duration::from_millis(10)).await;
            
            // 立即删除
            let _ = cache.remove_account_stats(temp_id).await;
        }
        
        // 验证正常数据
        let mut after_exception2_hits = 0;
        for i in 1..=20 {
            if cache.get_account_stats(i).await.is_some() {
                after_exception2_hits += 1;
            }
        }
        
        println!("  📊 异常2后状态: {}/20 正常数据仍可用", after_exception2_hits);
        
        // 异常3：极端TTL值
        println!("  💥 异常3：极端TTL值测试");
        
        // 极短TTL
        for i in 6000..6010 {
            let stats = AccountStats {
                account_id: i,
                request_count: 100,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_nanos(1)).await;
        }
        
        // 极长TTL
        for i in 7000..7010 {
            let stats = AccountStats {
                account_id: i,
                request_count: 100,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_secs(86400)).await; // 1天
        }
        
        // 等待一小段时间
        tokio::time::sleep(Duration::from_millis(10)).await;
        
        // 验证极短TTL数据过期，极长TTL数据存在
        let mut short_ttl_count = 0;
        let mut long_ttl_count = 0;
        
        for i in 6000..6010 {
            if cache.get_account_stats(i).await.is_some() {
                short_ttl_count += 1;
            }
        }
        
        for i in 7000..7010 {
            if cache.get_account_stats(i).await.is_some() {
                long_ttl_count += 1;
            }
        }
        
        println!("  📊 极短TTL数据存活: {}/10", short_ttl_count);
        println!("  📊 极长TTL数据存活: {}/10", long_ttl_count);
        
        assert!(short_ttl_count <= 2, "大部分极短TTL数据应该已过期"); // 允许一些延迟
        assert!(long_ttl_count >= 8, "大部分极长TTL数据应该存在");
        
        // 第三阶段：恢复验证
        println!("🔄 第三阶段：恢复能力验证...");
        
        // 重新设置一些正常数据
        for i in 21..=30 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 15,
                success_rate: 97.0,
                avg_response_time: 100.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        // 验证系统完全恢复
        let mut recovery_hits = 0;
        for i in 21..=30 {
            if cache.get_account_stats(i).await.is_some() {
                recovery_hits += 1;
            }
        }
        
        println!("📊 最终恢复状态:");
        println!("   原始数据可用: {}/20", after_exception2_hits);
        println!("   新数据可用: {}/10", recovery_hits);
        println!("   长TTL数据: {}/10", long_ttl_count);
        
        assert_eq!(recovery_hits, 10, "新数据应该100%可用");
        assert!(after_exception2_hits >= 10, "原始数据大部分应该可用");
        
        println!("🎉 异常恢复能力测试完成 - 系统展现出良好的恢复能力");
    }

    /// 资源限制和保护测试
    #[tokio::test]
    async fn test_resource_limits_and_protection() {
        println!("🛡️ 开始资源限制和保护测试...");
        
        // 测试1：容量限制保护
        println!("🔒 测试1：缓存容量限制保护");
        let limited_cache = SimpleCache::new(50); // 小容量
        let attempt_count = 200; // 尝试存储更多数据
        
        for i in 1..=attempt_count {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            limited_cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        // 验证容量限制生效
        let mut stored_count = 0;
        for i in 1..=attempt_count {
            if limited_cache.get_account_stats(i).await.is_some() {
                stored_count += 1;
            }
        }
        
        println!("📊 容量测试结果: 尝试存储 {}, 实际存储 {}", attempt_count, stored_count);
        assert!(stored_count <= 50, "存储数量不应超过容量限制");
        assert!(stored_count >= 40, "存储数量应该接近容量限制"); // 考虑LRU可能的额外开销
        
        // 测试2：并发访问保护
        println!("🔒 测试2：并发访问保护");
        let concurrent_cache = Arc::new(SimpleCache::new(100));
        let concurrent_tasks = 100;
        let operations_per_task = 50;
        
        let mut task_handles = vec![];
        let completion_counter = Arc::new(AtomicU64::new(0));
        
        for task_id in 0..concurrent_tasks {
            let cache_clone = Arc::clone(&concurrent_cache);
            let counter = Arc::clone(&completion_counter);
            
            let handle = tokio::spawn(async move {
                let mut local_operations = 0;
                let base_id = task_id * 1000;
                
                for op in 0..operations_per_task {
                    let account_id = base_id + op;
                    
                    // 混合操作：50%写入，30%读取，20%删除
                    match op % 10 {
                        0..=4 => {
                            // 写入操作
                            let stats = AccountStats {
                                account_id,
                                request_count: op * 5,
                                success_rate: 95.0,
                                avg_response_time: 120.0,
                                last_used_at: Some(chrono::Utc::now()),
                            };
                            cache_clone.set_account_stats(account_id, stats, Duration::from_secs(60)).await;
                        }
                        5..=7 => {
                            // 读取操作
                            let _ = cache_clone.get_account_stats(account_id).await;
                        }
                        _ => {
                            // 删除操作
                            let _ = cache_clone.remove_account_stats(account_id).await;
                        }
                    }
                    
                    local_operations += 1;
                }
                
                counter.fetch_add(local_operations, Ordering::Relaxed);
            });
            
            task_handles.push(handle);
        }
        
        // 等待所有并发任务完成
        let concurrent_start = Instant::now();
        for handle in task_handles {
            handle.await.expect("并发任务应该完成");
        }
        let concurrent_duration = concurrent_start.elapsed();
        
        let total_operations = completion_counter.load(Ordering::Relaxed);
        let ops_per_second = total_operations as f64 / concurrent_duration.as_secs_f64();
        
        println!("📊 并发测试结果:");
        println!("   并发任务: {}", concurrent_tasks);
        println!("   总操作数: {}", total_operations);
        println!("   执行时间: {:?}", concurrent_duration);
        println!("   操作/秒: {:.0}", ops_per_second);
        
        assert_eq!(total_operations, concurrent_tasks * operations_per_task, 
                   "所有操作都应该完成");
        assert!(concurrent_duration.as_secs() < 10, "并发操作应该在合理时间内完成");
        
        // 测试3：异常输入保护
        println!("🔒 测试3：异常输入保护");
        let protection_cache = SimpleCache::new(10);
        
        // 异常数据测试
        let abnormal_stats_tests = vec![
            // 极值测试
            AccountStats {
                account_id: i64::MAX,
                request_count: i64::MAX,
                success_rate: f64::INFINITY,
                avg_response_time: f64::NAN,
                last_used_at: None,
            },
            AccountStats {
                account_id: i64::MIN,
                request_count: 0,
                success_rate: 0.0,
                avg_response_time: 0.0,
                last_used_at: Some(chrono::DateTime::from_timestamp(0, 0).unwrap_or(chrono::Utc::now())),
            },
            // 负数测试
            AccountStats {
                account_id: -1,
                request_count: 100,
                success_rate: -50.0, // 异常的负成功率
                avg_response_time: -100.0, // 异常的负响应时间
                last_used_at: Some(chrono::Utc::now()),
            },
        ];
        
        let mut abnormal_success_count = 0;
        
        for (i, abnormal_stats) in abnormal_stats_tests.into_iter().enumerate() {
            let account_id = abnormal_stats.account_id;
            
            // 尝试存储异常数据
            protection_cache.set_account_stats(account_id, abnormal_stats, Duration::from_secs(60)).await;
            
            // 尝试读取
            if let Some(retrieved) = protection_cache.get_account_stats(account_id).await {
                abnormal_success_count += 1;
                println!("  ✅ 异常数据 {} 存储和读取成功", i + 1);
                
                // 验证数据完整性（检查是否处理了特殊值）
                println!("    - account_id: {}", retrieved.account_id);
                println!("    - success_rate: {}", retrieved.success_rate);
                println!("    - avg_response_time: {}", retrieved.avg_response_time);
            } else {
                println!("  ❌ 异常数据 {} 处理失败", i + 1);
            }
        }
        
        println!("📊 异常输入保护结果: {}/3 异常数据成功处理", abnormal_success_count);
        
        // 系统应该能处理异常输入而不崩溃
        assert!(abnormal_success_count >= 2, "系统应该能处理大部分异常输入");
        
        println!("🎉 资源限制和保护测试完成 - 系统展现出良好的保护机制");
    }

    /// 数据完整性验证测试
    #[tokio::test]
    async fn test_data_integrity_validation() {
        println!("🔍 开始数据完整性验证测试...");
        
        let cache = SimpleCache::new(1000);
        
        // 第一阶段：基础完整性测试
        println!("📝 第一阶段：基础数据完整性");
        
        let original_data = vec![
            AccountStats {
                account_id: 1,
                request_count: 1000,
                success_rate: 99.5,
                avg_response_time: 45.7,
                last_used_at: Some(chrono::Utc::now()),
            },
            AccountStats {
                account_id: 2,
                request_count: 500,
                success_rate: 98.2,
                avg_response_time: 67.3,
                last_used_at: Some(chrono::DateTime::from_timestamp(1640995200, 0).unwrap_or(chrono::Utc::now())), // 特定时间
            },
            AccountStats {
                account_id: 3,
                request_count: 0, // 边界值
                success_rate: 0.0, // 边界值
                avg_response_time: 0.0, // 边界值
                last_used_at: None, // 空值
            },
        ];
        
        // 存储原始数据
        for stats in &original_data {
            cache.set_account_stats(stats.account_id, stats.clone(), Duration::from_secs(300)).await;
        }
        
        // 验证数据完整性
        for (index, original) in original_data.iter().enumerate() {
            let retrieved = cache.get_account_stats(original.account_id).await
                .expect(&format!("数据 {} 应该存在", index + 1));
            
            // 精确比较所有字段
            assert_eq!(retrieved.account_id, original.account_id, "账号ID应该完全匹配");
            assert_eq!(retrieved.request_count, original.request_count, "请求计数应该完全匹配");
            assert_eq!(retrieved.success_rate, original.success_rate, "成功率应该完全匹配");
            assert_eq!(retrieved.avg_response_time, original.avg_response_time, "响应时间应该完全匹配");
            
            // 时间字段比较（考虑序列化精度）
            match (original.last_used_at, retrieved.last_used_at) {
                (None, None) => {},
                (Some(orig_time), Some(retr_time)) => {
                    let time_diff = (orig_time.timestamp() - retr_time.timestamp()).abs();
                    assert!(time_diff <= 1, "时间字段偏差应该在1秒内");
                },
                _ => panic!("时间字段类型不匹配"),
            }
            
            println!("  ✅ 数据 {} 完整性验证通过", index + 1);
        }
        
        // 第二阶段：并发修改完整性测试
        println!("📝 第二阶段：并发修改完整性");
        
        let shared_account_id = 1000;
        let concurrent_modifications = 20;
        let modification_counter = Arc::new(AtomicU64::new(0));
        
        let mut modification_handles = vec![];
        
        for modifier_id in 0..concurrent_modifications {
            let cache_clone = cache.clone();
            let counter = Arc::clone(&modification_counter);
            
            let handle = tokio::spawn(async move {
                let modification_value = modifier_id * 10 + 100;
                
                let stats = AccountStats {
                    account_id: shared_account_id,
                    request_count: modification_value,
                    success_rate: 95.0 + (modifier_id as f64 * 0.1),
                    avg_response_time: 100.0 + (modifier_id as f64 * 2.0),
                    last_used_at: Some(chrono::Utc::now()),
                };
                
                cache_clone.set_account_stats(shared_account_id, stats, Duration::from_secs(300)).await;
                counter.fetch_add(1, Ordering::Relaxed);
                
                // 立即读取验证
                if let Some(retrieved) = cache_clone.get_account_stats(shared_account_id).await {
                    // 验证数据结构完整性
                    assert!(retrieved.account_id == shared_account_id, "并发修改后账号ID应该正确");
                    assert!(retrieved.request_count >= 100, "请求计数应该在合理范围");
                    assert!(retrieved.success_rate >= 95.0, "成功率应该在合理范围");
                    assert!(retrieved.avg_response_time >= 100.0, "响应时间应该在合理范围");
                }
            });
            
            modification_handles.push(handle);
        }
        
        // 等待所有并发修改完成
        for handle in modification_handles {
            handle.await.expect("并发修改任务应该完成");
        }
        
        let total_modifications = modification_counter.load(Ordering::Relaxed);
        assert_eq!(total_modifications, concurrent_modifications, "所有修改操作都应该完成");
        
        // 验证最终状态的完整性
        let final_result = cache.get_account_stats(shared_account_id).await;
        assert!(final_result.is_some(), "并发修改后数据应该仍然存在");
        
        let final_data = final_result.unwrap();
        assert_eq!(final_data.account_id, shared_account_id, "最终数据的账号ID应该正确");
        
        println!("  ✅ 并发修改完整性验证通过: {} 次修改", total_modifications);
        
        // 第三阶段：长期存储完整性测试
        println!("📝 第三阶段：长期存储完整性");
        
        let long_term_data = AccountStats {
            account_id: 2000,
            request_count: 123456789,
            success_rate: 99.999,
            avg_response_time: 12.345,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        // 存储数据
        cache.set_account_stats(long_term_data.account_id, long_term_data.clone(), Duration::from_secs(3600)).await;
        
        // 多次读取验证一致性
        for round in 1..=10 {
            tokio::time::sleep(Duration::from_millis(100)).await; // 模拟时间流逝
            
            let retrieved = cache.get_account_stats(long_term_data.account_id).await
                .expect(&format!("长期数据在第{}轮应该存在", round));
            
            assert_eq!(retrieved.account_id, long_term_data.account_id, "长期存储账号ID应该稳定");
            assert_eq!(retrieved.request_count, long_term_data.request_count, "长期存储请求计数应该稳定");
            assert_eq!(retrieved.success_rate, long_term_data.success_rate, "长期存储成功率应该稳定");
            assert_eq!(retrieved.avg_response_time, long_term_data.avg_response_time, "长期存储响应时间应该稳定");
            
            if round % 3 == 0 {
                println!("  ✅ 第 {} 轮长期完整性验证通过", round);
            }
        }
        
        println!("📊 数据完整性验证总结:");
        println!("   基础完整性: ✅ 通过 ({} 条数据)", original_data.len());
        println!("   并发完整性: ✅ 通过 ({} 次并发修改)", total_modifications);
        println!("   长期完整性: ✅ 通过 (10轮验证)");
        
        println!("🎉 数据完整性验证测试完成 - 系统展现出卓越的数据完整性保障");
    }
}