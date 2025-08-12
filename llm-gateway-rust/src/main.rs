//! LLM Gateway Rust 服务主入口
//! 
//! 智能代理服务，支持负载均衡和路由

use std::env;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use llm_gateway_rust::{Config, Database, create_routes};
use llm_gateway_rust::business::services::{SettingsService, SharedSettingsService, RateLimitService, SharedRateLimitService};
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "llm_gateway_rust=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 加载环境变量
    dotenv::dotenv().ok();

    info!("🚀 启动 LLM Gateway Rust 服务");

    // 加载配置
    let config = Config::load()?;
    info!("✅ 配置加载成功");

    // 初始化数据库连接
    let database = Database::new(&config).await?;
    info!("✅ 数据库连接成功");

    // 检查数据库迁移
    let migrations_ok = database.check_migrations().await?;
    if migrations_ok {
        info!("✅ 数据库迁移检查通过");
    } else {
        info!("⚠️ 数据库表未找到，请确保已运行 sqlx migrate run");
    }

    // 初始化设置服务
    let settings_service: SharedSettingsService = Arc::new(SettingsService::new(database.clone()));
    settings_service.initialize().await?;
    info!("✅ 设置服务初始化成功");

    // 初始化速率限制服务
    let rate_limit_service: SharedRateLimitService = Arc::new(RateLimitService::new(settings_service.clone()));
    info!("✅ 速率限制服务初始化成功");

    // 创建路由
    let app = create_routes(database, settings_service, rate_limit_service).await?;
    info!("✅ 路由创建成功");

    // 启动服务器
    let port = env::var("PORT")
        .unwrap_or_else(|_| "9527".to_string())
        .parse::<u16>()
        .unwrap_or(9527);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    
    info!("🌐 服务器启动成功，监听端口: {}", port);
    info!("📖 API 文档: http://localhost:{}/health", port);

    axum::serve(listener, app.into_make_service_with_connect_info::<std::net::SocketAddr>()).await?;

    Ok(())
}