//! 高级集成测试
//! 
//! 覆盖复杂的业务场景和系统集成测试

#[cfg(test)]
mod advanced_integration_tests {
    use super::super::*;
    use std::time::Duration;
    use std::sync::Arc;
    use tokio;
    use std::collections::HashMap;

    /// 多层缓存协调测试
    #[tokio::test]
    async fn test_multi_layer_cache_coordination() {
        let config = CacheConfig {
            memory_cache_size: 100,
            memory_default_ttl: Duration::from_secs(10),
            redis_url: None, // 模拟Redis不可用
            redis_default_ttl: Duration::from_secs(60),
            redis_key_prefix: "coordination:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: true, // 尝试启用但会失败
            cache_miss_fallback: true,
        };

        let cache_manager = CacheManager::new(config).await
            .expect("缓存管理器创建应该成功");

        let stats = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };

        // 第一次设置 - 应该写入内存缓存
        cache_manager.set_account_stats(1, &stats, Duration::from_secs(10)).await
            .expect("设置应该成功");

        // 第一次获取 - 应该从内存缓存命中
        let result1 = cache_manager.get_account_stats(1).await;
        assert!(result1.is_some(), "内存缓存应该命中");

        // 等待内存缓存过期
        tokio::time::sleep(Duration::from_secs(11)).await;

        // 过期后获取 - 应该未命中
        let result2 = cache_manager.get_account_stats(1).await;
        assert!(result2.is_none(), "过期后应该未命中");

        // 验证缓存层级回退工作正常
        let cache_stats = cache_manager.get_cache_stats().await
            .expect("获取统计应该成功");
        
        assert!(cache_stats.memory_enabled, "内存缓存应该启用");
        assert!(!cache_stats.redis_enabled, "Redis缓存应该因连接失败而禁用");
        assert!(cache_stats.metrics.total_requests > 0, "应该记录请求");
    }

    /// 缓存预热和数据迁移测试
    #[tokio::test]
    async fn test_cache_warmup_and_migration() {
        let cache = SimpleCache::new(1000);
        
        println!("🔥 开始缓存预热测试...");
        
        // 模拟缓存预热 - 批量加载热点数据
        let warmup_data: Vec<_> = (1..=100).map(|i| {
            AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0 + (i as f64 * 0.01),
                avg_response_time: 100.0 + (i as f64 * 2.0),
                last_used_at: Some(chrono::Utc::now()),
            }
        }).collect();

        let warmup_start = std::time::Instant::now();
        
        // 预热阶段 - 并发加载
        let mut handles = vec![];
        for (i, stats) in warmup_data.into_iter().enumerate() {
            let cache_clone = cache.clone();
            let handle = tokio::spawn(async move {
                cache_clone.set_account_stats(stats.account_id, stats, Duration::from_secs(300)).await;
            });
            handles.push(handle);
            
            // 控制并发数，避免过度并发
            if (i + 1) % 20 == 0 {
                for handle in handles.drain(..) {
                    handle.await.expect("预热任务应该成功");
                }
            }
        }
        
        // 等待剩余任务完成
        for handle in handles {
            handle.await.expect("预热任务应该成功");
        }
        
        let warmup_duration = warmup_start.elapsed();
        println!("📊 缓存预热完成: 100条数据, 耗时 {:?}", warmup_duration);
        
        // 验证预热效果 - 访问热点数据应该全部命中
        let access_start = std::time::Instant::now();
        let mut hit_count = 0;
        
        for i in 1..=100 {
            if cache.get_account_stats(i).await.is_some() {
                hit_count += 1;
            }
        }
        
        let access_duration = access_start.elapsed();
        println!("📊 热点数据访问: {}/100 命中, 耗时 {:?}", hit_count, access_duration);
        
        assert_eq!(hit_count, 100, "预热的数据应该全部命中");
        assert!(warmup_duration.as_millis() < 5000, "预热应该在5秒内完成");
        assert!(access_duration.as_millis() < 100, "热点访问应该很快");
    }

    /// 缓存一致性和事务测试
    #[tokio::test]
    async fn test_cache_consistency_and_transactions() {
        let cache = SimpleCache::new(10);
        
        // 模拟数据库事务场景
        let account_id = 1;
        let initial_stats = AccountStats {
            account_id,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 120.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        // 初始设置
        cache.set_account_stats(account_id, initial_stats.clone(), Duration::from_secs(300)).await;
        
        // 模拟事务开始 - 更新统计
        let updated_stats = AccountStats {
            account_id,
            request_count: 150, // 增加了50个请求
            success_rate: 96.0, // 成功率提升
            avg_response_time: 110.0, // 响应时间改善
            last_used_at: Some(chrono::Utc::now()),
        };
        
        // 事务提交 - 更新缓存
        cache.set_account_stats(account_id, updated_stats.clone(), Duration::from_secs(300)).await;
        
        // 验证更新的一致性
        let result = cache.get_account_stats(account_id).await;
        assert!(result.is_some(), "更新后的数据应该存在");
        
        let retrieved = result.unwrap();
        assert_eq!(retrieved.request_count, 150, "请求计数应该已更新");
        assert_eq!(retrieved.success_rate, 96.0, "成功率应该已更新");
        assert_eq!(retrieved.avg_response_time, 110.0, "响应时间应该已更新");
        
        // 模拟事务回滚场景 - 删除缓存条目
        let rollback_success = cache.remove_account_stats(account_id).await;
        assert!(rollback_success, "事务回滚应该成功删除缓存");
        
        // 验证回滚后状态
        let after_rollback = cache.get_account_stats(account_id).await;
        assert!(after_rollback.is_none(), "回滚后缓存应该为空");
        
        println!("✅ 缓存一致性和事务测试通过");
    }

    /// 缓存热点数据识别和优化测试
    #[tokio::test]
    async fn test_hotspot_identification_and_optimization() {
        let cache = SimpleCache::new(50); // 较小容量以触发LRU
        
        println!("🔥 开始热点数据识别测试...");
        
        // 模拟不同访问频率的数据
        let mut access_patterns = HashMap::new();
        
        // 热点数据 - 高频访问
        let hotspot_ids = vec![1, 2, 3, 4, 5];
        for &id in &hotspot_ids {
            access_patterns.insert(id, 50); // 高访问频率
        }
        
        // 温点数据 - 中频访问
        let warm_ids = vec![10, 11, 12, 13, 14];
        for &id in &warm_ids {
            access_patterns.insert(id, 10); // 中访问频率
        }
        
        // 冷点数据 - 低频访问
        let cold_ids = vec![20, 21, 22, 23, 24];
        for &id in &cold_ids {
            access_patterns.insert(id, 2); // 低访问频率
        }
        
        // 初始化所有数据
        for (&id, _) in &access_patterns {
            let stats = AccountStats {
                account_id: id,
                request_count: id * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(id, stats, Duration::from_secs(300)).await;
        }
        
        // 模拟访问模式
        let access_start = std::time::Instant::now();
        let mut total_accesses = 0;
        let mut hit_count = 0;
        
        for (&id, &frequency) in &access_patterns {
            for _ in 0..frequency {
                if cache.get_account_stats(id).await.is_some() {
                    hit_count += 1;
                }
                total_accesses += 1;
                
                // 小延迟模拟真实访问
                tokio::time::sleep(Duration::from_micros(100)).await;
            }
        }
        
        let access_duration = access_start.elapsed();
        let hit_rate = hit_count as f64 / total_accesses as f64;
        
        println!("📊 访问模式统计:");
        println!("   总访问: {}, 命中: {}, 命中率: {:.1}%", total_accesses, hit_count, hit_rate * 100.0);
        println!("   访问耗时: {:?}", access_duration);
        
        // 验证热点数据仍在缓存中
        let mut hotspot_survival = 0;
        for &id in &hotspot_ids {
            if cache.get_account_stats(id).await.is_some() {
                hotspot_survival += 1;
            }
        }
        
        // 验证冷点数据被淘汰
        let mut cold_survival = 0;
        for &id in &cold_ids {
            if cache.get_account_stats(id).await.is_some() {
                cold_survival += 1;
            }
        }
        
        println!("📊 数据生存情况:");
        println!("   热点数据存活: {}/{}", hotspot_survival, hotspot_ids.len());
        println!("   冷点数据存活: {}/{}", cold_survival, cold_ids.len());
        
        // 热点数据应该有更高的存活率
        let hotspot_survival_rate = hotspot_survival as f64 / hotspot_ids.len() as f64;
        let cold_survival_rate = cold_survival as f64 / cold_ids.len() as f64;
        
        assert!(hotspot_survival_rate > cold_survival_rate, 
                "热点数据存活率({:.1}%)应该高于冷点数据({:.1}%)", 
                hotspot_survival_rate * 100.0, cold_survival_rate * 100.0);
        
        assert!(hit_rate > 0.7, "整体命中率应该超过70%");
    }

    /// 缓存分片和负载均衡测试
    #[tokio::test]
    async fn test_cache_sharding_and_load_balancing() {
        println!("🔄 开始缓存分片测试...");
        
        // 创建多个缓存实例模拟分片
        let shard_count = 4;
        let mut shards = Vec::new();
        
        for i in 0..shard_count {
            let shard = SimpleCache::new(100);
            shards.push(shard);
        }
        
        // 分片函数 - 根据account_id进行一致性哈希
        let get_shard_index = |account_id: i64| -> usize {
            (account_id.abs() as usize) % shard_count
        };
        
        // 分布式写入测试
        let test_data_count = 1000;
        let mut shard_distribution = vec![0; shard_count];
        
        for i in 1..=test_data_count {
            let shard_index = get_shard_index(i);
            shard_distribution[shard_index] += 1;
            
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            shards[shard_index].set_account_stats(i, stats, Duration::from_secs(300)).await;
        }
        
        println!("📊 分片数据分布:");
        for (i, count) in shard_distribution.iter().enumerate() {
            let percentage = *count as f64 / test_data_count as f64 * 100.0;
            println!("   分片 {}: {} 条数据 ({:.1}%)", i, count, percentage);
        }
        
        // 验证负载均衡 - 每个分片的数据量应该相对均衡
        let avg_per_shard = test_data_count as f64 / shard_count as f64;
        for &count in &shard_distribution {
            let deviation = (count as f64 - avg_per_shard).abs() / avg_per_shard;
            assert!(deviation < 0.2, "分片负载偏差应该小于20%"); // 允许20%的偏差
        }
        
        // 分布式读取测试
        let read_start = std::time::Instant::now();
        let mut total_hits = 0;
        
        for i in 1..=test_data_count {
            let shard_index = get_shard_index(i);
            if shards[shard_index].get_account_stats(i).await.is_some() {
                total_hits += 1;
            }
        }
        
        let read_duration = read_start.elapsed();
        let read_hit_rate = total_hits as f64 / test_data_count as f64;
        
        println!("📊 分片读取结果:");
        println!("   总命中: {}/{}, 命中率: {:.1}%", total_hits, test_data_count, read_hit_rate * 100.0);
        println!("   读取耗时: {:?}", read_duration);
        
        assert_eq!(total_hits, test_data_count, "分片读取应该100%命中");
        assert!(read_duration.as_millis() < 1000, "分片读取应该快速完成");
    }

    /// 缓存监控和告警测试
    #[tokio::test]
    async fn test_cache_monitoring_and_alerting() {
        let config = CacheConfig {
            memory_cache_size: 20, // 小容量容易触发告警
            memory_default_ttl: Duration::from_secs(300),
            redis_url: None,
            redis_default_ttl: Duration::from_secs(600),
            redis_key_prefix: "monitoring:".to_string(),
            enable_memory_cache: true,
            enable_redis_cache: false,
            cache_miss_fallback: true,
        };

        let cache_manager = CacheManager::new(config).await
            .expect("缓存管理器创建应该成功");

        println!("📊 开始缓存监控测试...");

        // 模拟正常使用阶段
        for i in 1..=10 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache_manager.set_account_stats(i, &stats, Duration::from_secs(300)).await.unwrap();
        }

        // 检查初始状态
        let initial_stats = cache_manager.get_cache_stats().await.unwrap();
        println!("📊 初始状态: 总请求 {}, 内存命中 {}", 
                initial_stats.metrics.total_requests, initial_stats.metrics.memory_hits);

        // 模拟高负载阶段 - 触发缓存压力
        for i in 11..=50 {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache_manager.set_account_stats(i, &stats, Duration::from_secs(300)).await.unwrap();
            
            // 交替读取，产生命中和未命中
            let _ = cache_manager.get_account_stats(i).await; // 命中
            let _ = cache_manager.get_account_stats(i + 1000).await; // 未命中
        }

        // 检查高负载后的状态
        let high_load_stats = cache_manager.get_cache_stats().await.unwrap();
        println!("📊 高负载后: 总请求 {}, 内存命中 {}, 内存未命中 {}", 
                high_load_stats.metrics.total_requests,
                high_load_stats.metrics.memory_hits,
                high_load_stats.metrics.memory_misses);

        // 计算各种监控指标
        let hit_rate = high_load_stats.metrics.memory_hit_rate();
        let total_requests = high_load_stats.metrics.total_requests;
        let evictions = high_load_stats.metrics.memory_evictions;

        println!("📊 监控指标:");
        println!("   命中率: {:.1}%", hit_rate * 100.0);
        println!("   总请求数: {}", total_requests);
        println!("   淘汰次数: {}", evictions);

        // 模拟告警条件检查
        let mut alerts = Vec::new();

        if hit_rate < 0.5 {
            alerts.push(format!("缓存命中率过低: {:.1}%", hit_rate * 100.0));
        }

        if evictions > 20 {
            alerts.push(format!("缓存淘汰过于频繁: {} 次", evictions));
        }

        if total_requests > 1000 {
            alerts.push(format!("请求量过高: {} 次", total_requests));
        }

        println!("🚨 监控告警:");
        for alert in &alerts {
            println!("   - {}", alert);
        }

        // 验证监控数据的正确性
        assert!(total_requests > 0, "应该记录到请求");
        assert!(high_load_stats.metrics.memory_hits > 0, "应该有内存命中");
        assert!(high_load_stats.metrics.memory_misses > 0, "应该有内存未命中");
        
        // 验证指标计算正确
        let expected_hit_rate = high_load_stats.metrics.memory_hits as f64 / 
            (high_load_stats.metrics.memory_hits + high_load_stats.metrics.memory_misses) as f64;
        assert!((hit_rate - expected_hit_rate).abs() < 0.01, "命中率计算应该正确");
    }

    /// 缓存灾难恢复测试
    #[tokio::test]
    async fn test_cache_disaster_recovery() {
        println!("🚨 开始缓存灾难恢复测试...");

        // 第一阶段：正常运行
        let cache1 = SimpleCache::new(100);
        
        // 预置数据
        let critical_data = vec![
            (1, "关键用户1"),
            (2, "关键用户2"), 
            (3, "VIP用户"),
            (4, "企业客户"),
            (5, "高频交易账户"),
        ];

        for &(id, description) in &critical_data {
            let stats = AccountStats {
                account_id: id,
                request_count: id * 100,
                success_rate: 99.0,
                avg_response_time: 50.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache1.set_account_stats(id, stats, Duration::from_secs(300)).await;
            println!("📝 预置关键数据: {} - {}", id, description);
        }

        // 验证正常状态
        for &(id, _) in &critical_data {
            assert!(cache1.get_account_stats(id).await.is_some(), 
                    "关键数据 {} 应该存在", id);
        }

        println!("✅ 第一阶段：正常运行状态验证通过");

        // 第二阶段：模拟灾难（缓存实例失效）
        println!("🚨 第二阶段：模拟缓存灾难...");
        drop(cache1); // 模拟缓存实例崩溃

        // 第三阶段：灾难恢复
        println!("🔄 第三阶段：执行灾难恢复...");
        let cache2 = SimpleCache::new(100); // 新的缓存实例

        // 模拟从持久化存储恢复关键数据
        let recovery_start = std::time::Instant::now();
        
        for &(id, description) in &critical_data {
            // 模拟从数据库重建缓存数据
            let recovered_stats = AccountStats {
                account_id: id,
                request_count: id * 100,
                success_rate: 99.0,
                avg_response_time: 50.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            cache2.set_account_stats(id, recovered_stats, Duration::from_secs(300)).await;
            println!("🔄 恢复关键数据: {} - {}", id, description);
        }

        let recovery_duration = recovery_start.elapsed();
        println!("📊 恢复耗时: {:?}", recovery_duration);

        // 第四阶段：验证恢复效果
        println!("✅ 第四阶段：验证恢复效果...");
        
        let mut recovery_success_count = 0;
        for &(id, _) in &critical_data {
            if let Some(recovered_data) = cache2.get_account_stats(id).await {
                assert_eq!(recovered_data.account_id, id, "恢复的数据ID应该匹配");
                assert_eq!(recovered_data.request_count, id * 100, "恢复的数据内容应该匹配");
                recovery_success_count += 1;
                println!("✅ 数据 {} 恢复成功", id);
            } else {
                println!("❌ 数据 {} 恢复失败", id);
            }
        }

        let recovery_rate = recovery_success_count as f64 / critical_data.len() as f64;
        println!("📊 恢复统计:");
        println!("   成功恢复: {}/{}", recovery_success_count, critical_data.len());
        println!("   恢复率: {:.1}%", recovery_rate * 100.0);
        println!("   恢复时间: {:?}", recovery_duration);

        // 验证恢复质量
        assert_eq!(recovery_success_count, critical_data.len(), "所有关键数据都应该恢复成功");
        assert!(recovery_duration.as_millis() < 1000, "恢复应该快速完成");
        assert_eq!(recovery_rate, 1.0, "恢复率应该达到100%");

        println!("🎉 缓存灾难恢复测试完成！");
    }

    /// 缓存安全性和权限控制测试
    #[tokio::test]
    async fn test_cache_security_and_access_control() {
        println!("🔒 开始缓存安全性测试...");
        
        let cache = SimpleCache::new(100);
        
        // 模拟不同权限级别的数据
        let security_levels = vec![
            (1, "公开数据", "public"),
            (2, "内部数据", "internal"),
            (3, "敏感数据", "sensitive"),
            (4, "机密数据", "confidential"),
            (5, "绝密数据", "top_secret"),
        ];
        
        // 设置不同安全级别的数据
        for &(id, description, level) in &security_levels {
            let stats = AccountStats {
                account_id: id,
                request_count: id * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 根据安全级别设置不同的TTL
            let ttl = match level {
                "public" => Duration::from_secs(3600),      // 公开数据：1小时
                "internal" => Duration::from_secs(1800),    // 内部数据：30分钟
                "sensitive" => Duration::from_secs(600),    // 敏感数据：10分钟
                "confidential" => Duration::from_secs(300), // 机密数据：5分钟
                "top_secret" => Duration::from_secs(60),    // 绝密数据：1分钟
                _ => Duration::from_secs(300),
            };
            
            cache.set_account_stats(id, stats, ttl).await;
            println!("🔒 设置 {} 数据: {} (TTL: {:?})", level, description, ttl);
        }
        
        // 立即验证所有数据都存在
        for &(id, description, level) in &security_levels {
            assert!(cache.get_account_stats(id).await.is_some(), 
                    "{} 数据应该存在: {}", level, description);
        }
        
        println!("✅ 初始安全数据设置完成");
        
        // 模拟数据访问审计
        let mut access_log = Vec::new();
        
        // 模拟不同用户角色的访问
        let user_roles = vec![
            ("guest", vec![1]),           // 访客只能访问公开数据
            ("employee", vec![1, 2]),     // 员工可以访问公开和内部数据
            ("manager", vec![1, 2, 3]),   // 经理可以访问到敏感数据
            ("admin", vec![1, 2, 3, 4]),  // 管理员可以访问机密数据
            ("security", vec![1, 2, 3, 4, 5]), // 安全人员可以访问所有数据
        ];
        
        for (role, accessible_ids) in user_roles {
            println!("👤 模拟 {} 角色访问...", role);
            
            for &(id, description, level) in &security_levels {
                let access_allowed = accessible_ids.contains(&id);
                let access_time = chrono::Utc::now();
                
                if access_allowed {
                    // 允许访问
                    let result = cache.get_account_stats(id).await;
                    let access_success = result.is_some();
                    
                    access_log.push(format!(
                        "[{}] {} 访问 {} (ID: {}) - {} - {}",
                        access_time.format("%H:%M:%S"),
                        role,
                        description,
                        id,
                        level,
                        if access_success { "成功" } else { "失败(数据不存在)" }
                    ));
                    
                    if access_success {
                        println!("  ✅ 允许访问 {}: {}", level, description);
                    } else {
                        println!("  ⚠️  访问 {} 失败: {} (可能已过期)", level, description);
                    }
                } else {
                    // 拒绝访问 (在实际实现中会有权限检查)
                    access_log.push(format!(
                        "[{}] {} 尝试访问 {} (ID: {}) - {} - 权限拒绝",
                        access_time.format("%H:%M:%S"),
                        role,
                        description,
                        id,
                        level
                    ));
                    
                    println!("  ❌ 拒绝访问 {}: {} (权限不足)", level, description);
                }
                
                // 小延迟模拟真实访问间隔
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }
        
        // 输出访问审计日志
        println!("📋 访问审计日志:");
        for log_entry in &access_log {
            println!("  {}", log_entry);
        }
        
        // 验证安全策略
        println!("🔍 验证安全策略...");
        
        // 等待一段时间，让一些高安全级别的数据过期
        println!("⏳ 等待高安全级别数据过期...");
        tokio::time::sleep(Duration::from_secs(65)).await; // 等待绝密数据过期
        
        // 验证过期策略
        let top_secret_expired = cache.get_account_stats(5).await.is_none();
        let confidential_exists = cache.get_account_stats(4).await.is_some();
        
        assert!(top_secret_expired, "绝密数据应该已过期");
        assert!(confidential_exists, "机密数据应该仍然存在");
        
        println!("✅ 安全过期策略验证通过");
        println!("🎉 缓存安全性测试完成！");
    }
}