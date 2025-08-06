use sqlx::PgPool;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 加载环境变量
    dotenv::dotenv().ok();
    
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPool::connect(&database_url).await?;
    
    let password_hash = "$2b$12$VLn.hKzUybiRXsrn9uk5l.UQQd9CJnW5PsDzVoczDDdRnQ0PDVE7G";
    
    let result = sqlx::query!(
        "INSERT INTO users (username, email, password_hash, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING
         RETURNING id",
        "admin",
        "admin@llm-gateway.com",
        password_hash,
        true
    )
    .fetch_optional(&pool)
    .await?;
    
    match result {
        Some(row) => println!("✅ 用户创建成功，ID: {}", row.id),
        None => println!("ℹ️ 用户已存在，跳过创建"),
    }
    
    pool.close().await;
    Ok(())
}