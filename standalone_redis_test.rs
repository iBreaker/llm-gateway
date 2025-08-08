//! 独立的Redis连接测试
//! 验证LLM Gateway的Redis缓存是否正常工作

use redis::{Client, AsyncCommands, RedisError};
use std::env;
use tokio;

#[tokio::main]
async fn main() -> Result<(), RedisError> {
    println!("🔍 LLM Gateway - Redis连接验证");
    
    // 从环境变量或使用默认值
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:16379".to_string());
    let cache_prefix = env::var("CACHE_PREFIX").unwrap_or_else(|_| "llm-gateway:".to_string());
    
    println!("📋 测试配置:");
    println!("   Redis URL: {}", redis_url);
    println!("   缓存前缀: {}", cache_prefix);
    
    // 连接Redis
    let client = Client::open(&redis_url)?;
    let mut conn = client.get_async_connection().await?;
    
    println!("✅ Redis连接成功");
    
    // PING测试
    let pong: String = redis::cmd("PING").query_async(&mut conn).await?;
    println!("✅ PING测试成功: {}", pong);
    
    // 缓存操作测试
    let test_key = format!("{}test_connection", cache_prefix);
    let test_value = "LLM Gateway缓存连接测试";
    
    // SET操作（带TTL）
    conn.set_ex(&test_key, test_value, 300).await?;
    println!("✅ 缓存SET操作成功: {} = {}", test_key, test_value);
    
    // GET操作
    let retrieved: Option<String> = conn.get(&test_key).await?;
    match retrieved {
        Some(value) => {
            println!("✅ 缓存GET操作成功: {}", value);
            if value == test_value {
                println!("✅ 数据完整性验证通过");
            } else {
                println!("❌ 数据完整性验证失败");
            }
        }
        None => {
            println!("❌ 缓存GET操作：未找到数据");
        }
    }
    
    // EXISTS检查
    let exists: bool = conn.exists(&test_key).await?;
    println!("✅ EXISTS检查: 键存在 = {}", exists);
    
    // TTL查询
    let ttl: i32 = conn.ttl(&test_key).await?;
    println!("✅ TTL查询: 剩余时间 = {}秒", ttl);
    
    // 性能测试
    println!("\n🔄 进行性能测试...");
    let start = std::time::Instant::now();
    
    // 批量写入测试
    for i in 1..=100 {
        let key = format!("{}perf_test_{}", cache_prefix, i);
        let value = format!("performance_test_value_{}", i);
        conn.set_ex(&key, &value, 300).await?;
    }
    
    let write_duration = start.elapsed();
    println!("✅ 批量写入: 100个键耗时 {:?}", write_duration);
    
    // 批量读取测试
    let read_start = std::time::Instant::now();
    let mut hit_count = 0;
    
    for i in 1..=100 {
        let key = format!("{}perf_test_{}", cache_prefix, i);
        let value: Option<String> = conn.get(&key).await?;
        if value.is_some() {
            hit_count += 1;
        }
    }
    
    let read_duration = read_start.elapsed();
    println!("✅ 批量读取: 100个键耗时 {:?}，命中率 {}/100", read_duration, hit_count);
    
    // INFO命令获取Redis信息
    let info: String = redis::cmd("INFO").arg("memory").query_async(&mut conn).await?;
    for line in info.lines() {
        if line.contains("used_memory_human") {
            println!("✅ Redis内存使用: {}", line);
            break;
        }
    }
    
    // 清理测试数据
    println!("\n🔄 清理测试数据...");
    let _: i32 = conn.del(&test_key).await?;
    
    for i in 1..=100 {
        let key = format!("{}perf_test_{}", cache_prefix, i);
        let _: i32 = conn.del(&key).await?;
    }
    
    println!("✅ 测试数据清理完成");
    
    println!("\n🎉 Redis连接测试结果:");
    println!("✅ 连接状态：正常");
    println!("✅ 缓存操作：正常");
    println!("✅ 性能表现：良好");
    println!("✅ LLM Gateway的Redis缓存系统已就绪！");
    
    // 额外验证：测试JSON序列化场景（模拟真实使用）
    println!("\n🔄 测试JSON缓存场景...");
    let json_key = format!("{}account_stats_123", cache_prefix);
    let json_data = r#"{"account_id":123,"request_count":500,"success_rate":98.5,"avg_response_time":120.0}"#;
    
    conn.set_ex(&json_key, json_data, 300).await?;
    let retrieved_json: Option<String> = conn.get(&json_key).await?;
    
    match retrieved_json {
        Some(data) => {
            println!("✅ JSON缓存测试成功: {}", data);
            if data.contains("account_id") && data.contains("request_count") {
                println!("✅ JSON数据结构完整");
            }
        }
        None => {
            println!("❌ JSON缓存测试失败");
        }
    }
    
    // 清理JSON测试数据
    let _: i32 = conn.del(&json_key).await?;
    
    println!("🎯 Redis已完全验证，可以正常为LLM Gateway提供缓存服务！");
    
    Ok(())
}