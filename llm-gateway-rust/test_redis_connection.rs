//! Redis连接测试
//! 验证Redis是否正常连接和工作

use tokio;
use tracing::{info, error};
use std::time::Duration;

// 引入我们的缓存实现
use llm_gateway_rust::infrastructure::cache::{RedisCache, CacheResult};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 初始化日志
    tracing_subscriber::init();
    
    info!("🔍 开始Redis连接测试...");
    
    // 创建Redis缓存客户端
    let redis_cache = match RedisCache::new(
        "redis://localhost:6379",
        "test:".to_string(),
        Duration::from_secs(300),
        10,
    ) {
        Ok(cache) => {
            info!("✅ Redis客户端创建成功");
            cache
        }
        Err(e) => {
            error!("❌ Redis客户端创建失败: {}", e);
            return Ok(());
        }
    };
    
    // 测试Redis连接
    info!("🔄 测试Redis连接中...");
    match redis_cache.ping().await {
        Ok(_) => {
            info!("✅ Redis PING测试成功 - 连接正常");
        }
        Err(e) => {
            error!("❌ Redis连接失败: {}", e);
            info!("💡 请确保Redis服务器正在运行：");
            info!("   - 安装Redis: brew install redis (macOS) 或 apt-get install redis (Linux)");
            info!("   - 启动Redis: redis-server");
            info!("   - 或使用Docker: docker run -d -p 6379:6379 redis:alpine");
            return Ok(());
        }
    }
    
    // 测试缓存操作
    info!("🔄 测试Redis缓存操作...");
    
    // 设置测试数据
    let test_key = "connection_test";
    let test_value = "Hello Redis from LLM Gateway!";
    
    match redis_cache.set(test_key, &test_value, None).await {
        Ok(_) => {
            info!("✅ Redis SET操作成功");
        }
        Err(e) => {
            error!("❌ Redis SET操作失败: {}", e);
            return Ok(());
        }
    }
    
    // 读取测试数据
    match redis_cache.get::<String>(test_key).await {
        CacheResult::Hit(value, layer) => {
            info!("✅ Redis GET操作成功: 值='{}', 缓存层={:?}", value, layer);
            if value == test_value {
                info!("✅ 数据完整性验证通过");
            } else {
                error!("❌ 数据完整性验证失败");
            }
        }
        CacheResult::Miss => {
            error!("❌ Redis GET操作未命中，数据可能未正确保存");
        }
        CacheResult::Error(e) => {
            error!("❌ Redis GET操作失败: {}", e);
            return Ok(());
        }
    }
    
    // 测试键存在性检查
    match redis_cache.exists(test_key).await {
        Ok(exists) => {
            info!("✅ Redis EXISTS检查: 键存在={}", exists);
        }
        Err(e) => {
            error!("❌ Redis EXISTS操作失败: {}", e);
        }
    }
    
    // 测试TTL查询
    match redis_cache.ttl(test_key).await {
        Ok(ttl) => {
            info!("✅ Redis TTL查询: 剩余时间={}秒", ttl);
        }
        Err(e) => {
            error!("❌ Redis TTL操作失败: {}", e);
        }
    }
    
    // 清理测试数据
    match redis_cache.delete(test_key).await {
        Ok(deleted) => {
            info!("✅ Redis DELETE操作成功: 删除={}", deleted);
        }
        Err(e) => {
            error!("❌ Redis DELETE操作失败: {}", e);
        }
    }
    
    // 获取Redis信息
    match redis_cache.info().await {
        Ok(info) => {
            info!("✅ Redis服务器信息:");
            info!("   - 已用内存: {}", info.used_memory_human);
            info!("   - 连接客户端数: {}", info.connected_clients);
        }
        Err(e) => {
            error!("❌ Redis INFO操作失败: {}", e);
        }
    }
    
    info!("🎉 Redis连接测试完成！");
    Ok(())
}