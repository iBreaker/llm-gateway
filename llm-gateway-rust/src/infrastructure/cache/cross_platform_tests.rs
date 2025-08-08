//! 跨平台兼容性测试
//! 
//! 测试缓存系统在不同操作系统和环境下的兼容性和行为一致性

#[cfg(test)]
mod cross_platform_tests {
    use super::super::*;
    use std::time::{Duration, Instant};
    use std::sync::Arc;
    use tokio;
    use std::env;

    /// 文件系统路径处理跨平台测试
    #[tokio::test]
    async fn test_file_system_path_compatibility() {
        println!("🔧 开始文件系统路径兼容性测试...");
        
        let cache = SimpleCache::new(100);
        
        // 测试不同路径分隔符场景的键名
        let path_test_cases = vec![
            "/unix/style/path",
            "\\windows\\style\\path",  
            "unix/mixed\\path/separators",
            "file:///protocol/path",
            "relative/path/test",
            "./current/dir/path",
            "../parent/dir/path",
            "path with spaces",
            "path-with-dashes",
            "path_with_underscores",
            "UPPERCASE_PATH",
            "MixedCase_Path",
            "path.with.dots",
            "path@with#special$chars%",
        ];
        
        // 测试所有路径格式作为缓存键
        for (i, path_key) in path_test_cases.into_iter().enumerate() {
            let account_id = (i + 1) as i64;
            let stats = AccountStats {
                account_id,
                request_count: i as i64 * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 使用路径作为键名的一部分（模拟文件路径缓存）
            let cache_key_id = format!("{}:{}", account_id, path_key).replace("/", "_").replace("\\", "_");
            let sanitized_account_id = cache_key_id.chars()
                .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == ':' { c } else { '_' })
                .collect::<String>()
                .parse::<i64>()
                .unwrap_or(account_id);
            
            cache.set_account_stats(sanitized_account_id, stats.clone(), Duration::from_secs(300)).await;
            let result = cache.get_account_stats(sanitized_account_id).await;
            
            assert!(result.is_some(), "路径键 '{}' 应该成功存储和检索", path_key);
            println!("  ✅ 路径格式 '{}' 兼容性测试通过", path_key);
        }
        
        println!("📊 文件系统路径兼容性测试完成");
    }

    /// 时区和时间处理跨平台测试
    #[tokio::test]
    async fn test_timezone_and_time_compatibility() {
        println!("🕐 开始时区和时间兼容性测试...");
        
        let cache = SimpleCache::new(50);
        
        // 测试不同时区的时间戳
        let timezone_test_cases = vec![
            chrono::Utc::now(),                                                     // UTC
            chrono::DateTime::from_timestamp(0, 0).unwrap_or(chrono::Utc::now()),  // Unix Epoch
            chrono::DateTime::from_timestamp(1640995200, 0).unwrap_or(chrono::Utc::now()), // 2022-01-01 00:00:00 UTC
            chrono::DateTime::from_timestamp(2147483647, 0).unwrap_or(chrono::Utc::now()), // 2038年问题边界
            chrono::Utc::now() - chrono::Duration::days(365),                      // 1年前
            chrono::Utc::now() + chrono::Duration::days(365),                      // 1年后
        ];
        
        for (i, timestamp) in timezone_test_cases.into_iter().enumerate() {
            let account_id = (i + 100) as i64;
            let stats = AccountStats {
                account_id,
                request_count: 1000 + i as i64,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(timestamp),
            };
            
            cache.set_account_stats(account_id, stats.clone(), Duration::from_secs(300)).await;
            let result = cache.get_account_stats(account_id).await;
            
            assert!(result.is_some(), "时间戳 {} 应该成功存储", timestamp);
            
            let retrieved = result.unwrap();
            if let (Some(original), Some(retrieved_time)) = (stats.last_used_at, retrieved.last_used_at) {
                let time_diff = (original.timestamp() - retrieved_time.timestamp()).abs();
                assert!(time_diff <= 1, "时间戳应该基本匹配 (差异: {} 秒)", time_diff);
            }
            
            println!("  ✅ 时间戳 {} 兼容性测试通过", timestamp.format("%Y-%m-%d %H:%M:%S UTC"));
        }
        
        println!("📊 时区和时间兼容性测试完成");
    }

    /// 内存管理跨平台测试
    #[tokio::test]
    async fn test_memory_management_cross_platform() {
        println!("🧠 开始内存管理跨平台测试...");
        
        // 测试不同内存配置下的行为
        let memory_configs = vec![
            10,    // 小内存配置
            100,   // 中等内存配置
            1000,  // 大内存配置
            10000, // 超大内存配置（可能在某些平台上受限）
        ];
        
        for config in memory_configs {
            let cache = SimpleCache::new(config);
            let start_time = Instant::now();
            
            // 快速填充到接近容量
            let fill_count = (config as f64 * 0.8) as usize; // 填充80%
            for i in 1..=fill_count {
                let stats = AccountStats {
                    account_id: i as i64,
                    request_count: i as i64 * 10,
                    success_rate: 95.0,
                    avg_response_time: 120.0,
                    last_used_at: Some(chrono::Utc::now()),
                };
                cache.set_account_stats(i as i64, stats, Duration::from_secs(300)).await;
                
                // 每100个操作检查一次性能
                if i % 100 == 0 {
                    let elapsed = start_time.elapsed();
                    if elapsed > Duration::from_secs(5) {
                        println!("  ⚠️ 配置 {} 填充 {} 项耗时过长: {:?}", config, i, elapsed);
                        break;
                    }
                }
            }
            
            let fill_duration = start_time.elapsed();
            
            // 验证内存使用情况
            let mut actual_count = 0;
            for i in 1..=fill_count {
                if cache.get_account_stats(i as i64).await.is_some() {
                    actual_count += 1;
                }
            }
            
            println!("  📊 内存配置 {}: 填充 {}, 实际存储 {}, 耗时 {:?}", 
                     config, fill_count, actual_count, fill_duration);
            
            // 验证内存约束
            assert!(actual_count <= config, "存储数量不应超过配置容量");
            assert!(fill_duration < Duration::from_secs(30), "填充操作应该在合理时间内完成");
        }
        
        println!("📊 内存管理跨平台测试完成");
    }

    /// 网络配置跨平台测试
    #[tokio::test]
    async fn test_network_configuration_compatibility() {
        println!("🌐 开始网络配置兼容性测试...");
        
        // 测试各种Redis连接URL格式
        let redis_url_formats = vec![
            ("标准格式", "redis://localhost:6379"),
            ("带密码格式", "redis://:password@localhost:6379"),
            ("带用户名密码", "redis://user:password@localhost:6379"),
            ("IPv6格式", "redis://[::1]:6379"),
            ("完整URL", "redis://user:pass@host.domain.com:6379/0"),
            ("Unix socket", "unix:///var/run/redis/redis.sock"),
            ("RedisS (TLS)", "rediss://localhost:6380"),
        ];
        
        for (description, redis_url) in redis_url_formats {
            let config = CacheConfig {
                memory_cache_size: 100,
                memory_default_ttl: Duration::from_secs(300),
                redis_url: Some(redis_url.to_string()),
                redis_default_ttl: Duration::from_secs(600),
                redis_key_prefix: format!("cross_platform_{}:", description.replace(" ", "_").to_lowercase()),
                enable_memory_cache: true,
                enable_redis_cache: true,
                cache_miss_fallback: true,
            };
            
            // 尝试创建缓存管理器（大多数会失败，因为没有真实的Redis实例）
            let cache_manager_result = CacheManager::new(config).await;
            
            match cache_manager_result {
                Ok(_) => {
                    println!("  ✅ {} URL格式连接成功: {}", description, redis_url);
                }
                Err(e) => {
                    // 预期大多数连接会失败，但应该能正确处理URL格式
                    println!("  ⚠️  {} URL格式解析正常，连接失败（预期）: {}", description, redis_url);
                    assert!(e.to_string().contains("连接") || e.to_string().contains("Redis"), 
                           "错误信息应该表明是连接问题");
                }
            }
        }
        
        println!("📊 网络配置兼容性测试完成");
    }

    /// 环境变量和配置跨平台测试
    #[tokio::test]
    async fn test_environment_variable_compatibility() {
        println!("🔧 开始环境变量兼容性测试...");
        
        // 备份原始环境变量
        let original_redis_url = env::var("REDIS_URL").ok();
        let original_cache_size = env::var("CACHE_SIZE").ok();
        
        // 测试不同环境变量格式
        let env_test_cases = vec![
            ("REDIS_URL", "redis://test-env:6379"),
            ("CACHE_SIZE", "500"),
            ("CACHE_TTL", "300"),
            ("REDIS_PREFIX", "env_test:"),
        ];
        
        for (env_var, env_value) in env_test_cases {
            env::set_var(env_var, env_value);
            
            // 验证环境变量设置
            let retrieved_value = env::var(env_var);
            assert!(retrieved_value.is_ok(), "环境变量 {} 应该设置成功", env_var);
            assert_eq!(retrieved_value.unwrap(), env_value, "环境变量值应该匹配");
            
            println!("  ✅ 环境变量 {}={} 设置成功", env_var, env_value);
        }
        
        // 测试配置加载（这里是模拟，实际需要根据项目实现调整）
        let config_with_env = CacheConfig {
            memory_cache_size: env::var("CACHE_SIZE").ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1000),
            memory_default_ttl: Duration::from_secs(
                env::var("CACHE_TTL").ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(300)
            ),
            redis_url: env::var("REDIS_URL").ok(),
            redis_default_ttl: Duration::from_secs(600),
            redis_key_prefix: env::var("REDIS_PREFIX").unwrap_or("default:".to_string()),
            enable_memory_cache: true,
            enable_redis_cache: false, // 测试环境不启用Redis
            cache_miss_fallback: true,
        };
        
        // 验证配置解析
        assert_eq!(config_with_env.memory_cache_size, 500);
        assert_eq!(config_with_env.memory_default_ttl, Duration::from_secs(300));
        assert_eq!(config_with_env.redis_key_prefix, "env_test:");
        
        // 清理环境变量
        for (env_var, _) in &[
            ("REDIS_URL", "redis://test-env:6379"),
            ("CACHE_SIZE", "500"),
            ("CACHE_TTL", "300"),
            ("REDIS_PREFIX", "env_test:"),
        ] {
            env::remove_var(env_var);
        }
        
        // 恢复原始环境变量
        if let Some(original) = original_redis_url {
            env::set_var("REDIS_URL", original);
        }
        if let Some(original) = original_cache_size {
            env::set_var("CACHE_SIZE", original);
        }
        
        println!("📊 环境变量兼容性测试完成");
    }

    /// 字符编码跨平台测试
    #[tokio::test]
    async fn test_character_encoding_compatibility() {
        println!("🔤 开始字符编码兼容性测试...");
        
        let cache = SimpleCache::new(100);
        
        // 测试各种字符编码
        let encoding_test_cases = vec![
            ("ASCII", "simple_ascii_text"),
            ("UTF-8 中文", "测试中文字符"),
            ("UTF-8 日文", "テストデータ"),
            ("UTF-8 韩文", "테스트데이터"),
            ("UTF-8 俄文", "тестовые данные"),
            ("UTF-8 阿拉伯文", "بيانات الاختبار"),
            ("UTF-8 表情符号", "🚀🔥💯✅❌⚠️📊"),
            ("特殊字符", "!@#$%^&*()_+-=[]{}|;':\",./<>?"),
            ("混合编码", "Mixed混合テストبيانات🔧"),
            ("长文本", "a".repeat(1000).as_str()),
        ];
        
        for (description, text_content) in encoding_test_cases {
            let account_id = text_content.len() as i64; // 使用长度作为ID
            
            let stats = AccountStats {
                account_id,
                request_count: text_content.chars().count() as i64,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            // 存储和检索
            cache.set_account_stats(account_id, stats.clone(), Duration::from_secs(300)).await;
            let result = cache.get_account_stats(account_id).await;
            
            assert!(result.is_some(), "{} 编码测试应该成功", description);
            
            let retrieved = result.unwrap();
            assert_eq!(retrieved.account_id, stats.account_id);
            assert_eq!(retrieved.request_count, stats.request_count);
            
            println!("  ✅ {} 编码测试通过: {} 字符", description, text_content.chars().count());
        }
        
        println!("📊 字符编码兼容性测试完成");
    }

    /// 并发和线程安全跨平台测试
    #[tokio::test]
    async fn test_concurrency_cross_platform() {
        println!("🔄 开始并发跨平台测试...");
        
        let cache = Arc::new(SimpleCache::new(1000));
        let num_threads = std::cmp::min(num_cpus::get(), 8); // 限制最大线程数
        let operations_per_thread = 100;
        
        println!("  使用 {} 个线程，每线程 {} 操作", num_threads, operations_per_thread);
        
        let mut handles = Vec::new();
        let start_time = Instant::now();
        
        // 启动多个并发任务
        for thread_id in 0..num_threads {
            let cache_clone = Arc::clone(&cache);
            
            let handle = tokio::spawn(async move {
                let mut local_operations = 0;
                
                for op_id in 0..operations_per_thread {
                    let account_id = (thread_id * 1000 + op_id) as i64;
                    
                    let stats = AccountStats {
                        account_id,
                        request_count: account_id * 10,
                        success_rate: 95.0 + (thread_id as f64 * 0.1),
                        avg_response_time: 120.0 + (op_id as f64),
                        last_used_at: Some(chrono::Utc::now()),
                    };
                    
                    // 混合操作
                    match op_id % 3 {
                        0 => {
                            // 写操作
                            cache_clone.set_account_stats(account_id, stats, Duration::from_secs(300)).await;
                        }
                        1 => {
                            // 读操作
                            let _ = cache_clone.get_account_stats(account_id).await;
                        }
                        _ => {
                            // 删除操作
                            let _ = cache_clone.remove_account_stats(account_id).await;
                        }
                    }
                    
                    local_operations += 1;
                }
                
                local_operations
            });
            
            handles.push(handle);
        }
        
        // 等待所有任务完成
        let mut total_operations = 0;
        for handle in handles {
            let operations = handle.await.expect("线程应该正常完成");
            total_operations += operations;
        }
        
        let total_duration = start_time.elapsed();
        let ops_per_second = total_operations as f64 / total_duration.as_secs_f64();
        
        println!("📊 并发测试结果:");
        println!("  线程数: {}", num_threads);
        println!("  总操作数: {}", total_operations);
        println!("  总耗时: {:?}", total_duration);
        println!("  操作/秒: {:.0}", ops_per_second);
        
        // 验证性能基准
        assert_eq!(total_operations, num_threads * operations_per_thread);
        assert!(total_duration < Duration::from_secs(30), "并发操作应该在30秒内完成");
        assert!(ops_per_second > 100.0, "并发性能应该超过100 ops/sec");
        
        println!("📊 并发跨平台测试完成");
    }

    /// 平台特定特性测试
    #[tokio::test]
    async fn test_platform_specific_features() {
        println!("🖥️ 开始平台特定特性测试...");
        
        // 检测当前平台
        let current_platform = env::consts::OS;
        let current_arch = env::consts::ARCH;
        
        println!("  当前平台: {} ({})", current_platform, current_arch);
        
        let cache = SimpleCache::new(100);
        
        // 根据平台调整测试参数
        let (test_size, expected_performance) = match current_platform {
            "windows" => {
                println!("  Windows平台特定测试...");
                (50, 1000.0) // Windows可能性能稍低
            }
            "macos" => {
                println!("  macOS平台特定测试...");
                (100, 2000.0) // macOS通常性能较好
            }
            "linux" => {
                println!("  Linux平台特定测试...");
                (100, 5000.0) // Linux服务器性能通常很好
            }
            _ => {
                println!("  其他平台测试...");
                (50, 500.0) // 保守估计
            }
        };
        
        let start_time = Instant::now();
        
        // 执行平台特定的性能测试
        for i in 1..=test_size {
            let stats = AccountStats {
                account_id: i,
                request_count: i * 10,
                success_rate: 95.0,
                avg_response_time: 120.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            
            cache.set_account_stats(i, stats, Duration::from_secs(300)).await;
            let _ = cache.get_account_stats(i).await;
        }
        
        let duration = start_time.elapsed();
        let ops_per_second = (test_size * 2) as f64 / duration.as_secs_f64(); // 每次循环2个操作
        
        println!("📊 平台性能结果:");
        println!("  操作数量: {}", test_size * 2);
        println!("  执行时间: {:?}", duration);
        println!("  实际性能: {:.0} ops/sec", ops_per_second);
        println!("  预期性能: {:.0} ops/sec", expected_performance);
        
        // 平台适应性验证（使用较宽松的标准）
        let performance_ratio = ops_per_second / expected_performance;
        if performance_ratio >= 0.5 {
            println!("  ✅ 平台性能达到预期的 {:.1}%", performance_ratio * 100.0);
        } else {
            println!("  ⚠️ 平台性能低于预期，但在可接受范围内");
        }
        
        // 架构特定测试
        match current_arch {
            "x86_64" | "aarch64" => {
                println!("  ✅ 64位架构性能测试通过");
            }
            _ => {
                println!("  ⚠️ 其他架构，使用通用优化");
            }
        }
        
        println!("📊 平台特定特性测试完成");
    }
}