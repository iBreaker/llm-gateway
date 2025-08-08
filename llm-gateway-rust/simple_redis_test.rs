//! 简化的Redis连接测试
//! 仅测试Redis基础连接，不依赖LLM Gateway的其他组件

use redis::{Client, AsyncCommands, RedisError};
use tokio;

#[tokio::main]
async fn main() -> Result<(), RedisError> {
    println!("🔍 开始Redis连接测试...");
    
    // 尝试连接Redis
    let client = Client::open("redis://localhost:6379")?;
    let mut conn = client.get_async_connection().await?;
    
    println!("✅ Redis连接成功");
    
    // 测试PING命令
    let pong: String = redis::cmd("PING").query_async(&mut conn).await?;
    println!("✅ PING测试成功: {}", pong);
    
    // 测试SET/GET操作
    let test_key = "llm-gateway:test";
    let test_value = "Hello Redis!";
    
    // SET操作
    conn.set(test_key, test_value).await?;
    println!("✅ SET操作成功: {} = {}", test_key, test_value);
    
    // GET操作
    let retrieved_value: String = conn.get(test_key).await?;
    println!("✅ GET操作成功: {} = {}", test_key, retrieved_value);
    
    // 验证数据一致性
    if retrieved_value == test_value {
        println!("✅ 数据一致性验证通过");
    } else {
        println!("❌ 数据一致性验证失败");
    }
    
    // 清理测试数据
    let deleted: i32 = conn.del(test_key).await?;
    println!("✅ 清理测试数据: 删除了{}个键", deleted);
    
    println!("🎉 Redis连接测试完成！Redis已成功连接并可正常使用");
    
    Ok(())
}