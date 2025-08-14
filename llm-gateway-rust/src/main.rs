//! LLM Gateway Rust 服务主入口
//! 
//! 智能代理服务，支持负载均衡和路由

use std::env;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use llm_gateway_rust::{Config, Database, create_routes};
use llm_gateway_rust::business::services::{SettingsService, SharedSettingsService, RateLimitService, SharedRateLimitService};
use llm_gateway_rust::business::services::proxy_manager::SystemProxyManager;
use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志 - 默认INFO等级，便于生产环境使用
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "llm_gateway_rust=info,tower_http=info".into()),
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

    // 初始化代理管理器
    let proxy_manager = Arc::new(SystemProxyManager::new(database.proxies.clone()));
    proxy_manager.initialize_from_database().await?;
    info!("✅ 代理管理器初始化成功");

    // 创建路由
    let app = create_routes(database, settings_service, rate_limit_service, proxy_manager).await?;
    info!("✅ 路由创建成功");

    // 启动服务器
    let port = env::var("PORT")
        .unwrap_or_else(|_| "9527".to_string())
        .parse::<u16>()
        .unwrap_or(9527);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
    
    info!("🌐 服务器启动成功，监听端口: {} (HTTP/1.1)", port);
    info!("📖 API 文档: http://localhost:{}/health", port);

    // 配置更稳健的 HTTP 服务器（兼容性优先）
    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>()
    )
    // 配置TCP选项以提高兼容性
    .tcp_nodelay(true)  // 禁用 Nagle 算法，减少延迟
    .with_graceful_shutdown(async {
        tokio::signal::ctrl_c().await.ok();
        info!("🛑 接收到关闭信号，正在优雅关闭服务器...");
    });

    server.await?;

    Ok(())
}