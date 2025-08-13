use std::env;
use sqlx::PgPool;
use serde_json::Value;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 加载环境变量
    dotenv::dotenv().ok();
    
    let database_url = env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    
    let pool = PgPool::connect(&database_url).await?;
    
    println!("🔍 检查数据库中的credentials字段内容:");
    println!("=====================================");

    let rows = sqlx::query!(
        "SELECT id, name, service_provider, auth_method, credentials, proxy_config FROM upstream_accounts ORDER BY id"
    )
    .fetch_all(&pool)
    .await?;

    for row in rows {
        println!("\nID: {}", row.id);
        println!("Name: {}", row.name);
        println!("Provider: {}", row.service_provider);
        println!("Auth Method: {}", row.auth_method);
        
        // 解析credentials JSON
        if let Some(credentials) = &row.credentials {
            let json_value: Value = serde_json::from_value(credentials.clone())?;
            println!("Credentials: {:#}", json_value);
        } else {
            println!("Credentials: null");
        }
        
        // 解析proxy_config JSON
        if let Some(proxy_config) = &row.proxy_config {
            let json_value: Value = serde_json::from_value(proxy_config.clone())?;
            println!("Proxy Config: {:#}", json_value);
        } else {
            println!("Proxy Config: null");
        }
        
        println!("---");
    }

    Ok(())
}