//! 简单的数据库连接测试
//! 验证PostgreSQL连接是否正常工作

use sqlx::{PgPool, postgres::PgPoolOptions};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 开始数据库连接测试...");
    
    let database_url = "postgresql://postgres:postgres@localhost:15432/llm_gateway";
    
    // 使用最简单的连接池配置
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .min_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(database_url)
        .await?;
    
    println!("✅ 连接池创建成功");
    
    // 执行简单查询
    let result = sqlx::query("SELECT 1 as test, version() as version")
        .fetch_one(&pool)
        .await?;
    
    let test_value: i32 = result.get("test");
    let version: String = result.get("version");
    
    println!("✅ 数据库查询成功");
    println!("   测试值: {}", test_value);
    println!("   数据库版本: {}", version);
    
    // 测试表是否存在
    let table_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = 'public' AND table_name = 'users'"
    )
    .fetch_one(&pool)
    .await?;
    
    println!("✅ 表检查成功，users表存在: {}", table_count > 0);
    
    pool.close().await;
    println!("🎉 数据库连接测试完成！");
    
    Ok(())
}