//! 路由配置模块
//! 
//! 组织和配置所有HTTP路由

use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer, services::ServeDir};

use crate::infrastructure::Database;
use crate::presentation::handlers;
use crate::auth::middleware::{auth_middleware, api_key_middleware};

/// 创建应用路由
pub async fn create_routes(database: Database) -> anyhow::Result<Router> {
    // 认证相关路由（公开）
    let auth_routes = Router::new()
        .route("/api/auth/login", post(handlers::auth::login))
        .route("/api/auth/refresh", post(handlers::auth::refresh_token));

    // 需要JWT认证的路由
    let protected_routes = Router::new()
        .route("/api/auth/me", get(handlers::auth::get_current_user))
        .route("/api/auth/logout", post(handlers::auth::logout))
        .route("/api/auth/change-password", post(handlers::auth::change_password))
        
        // API Key管理
        .route("/api/keys", post(handlers::api_keys::create_api_key))
        .route("/api/keys", get(handlers::api_keys::list_api_keys))
        .route("/api/keys/:id", get(handlers::api_keys::get_api_key))
        .route("/api/keys/:id", put(handlers::api_keys::update_api_key))
        .route("/api/keys/:id", delete(handlers::api_keys::delete_api_key))
        .route("/api/keys/:id/regenerate", post(handlers::api_keys::regenerate_api_key))
        
        // API Key管理 (前端兼容路径)
        .route("/api/api-keys", post(handlers::api_keys::create_api_key))
        .route("/api/api-keys", get(handlers::api_keys::list_api_keys))
        .route("/api/api-keys/:id", get(handlers::api_keys::get_api_key))
        .route("/api/api-keys/:id", put(handlers::api_keys::update_api_key))
        .route("/api/api-keys/:id", delete(handlers::api_keys::delete_api_key))
        .route("/api/api-keys/:id/regenerate", post(handlers::api_keys::regenerate_api_key))
        
        // 健康检查管理
        .route("/api/health/account/:id", get(handlers::health::check_account_health))
        .route("/api/health/batch", post(handlers::health::batch_health_check))
        .route("/api/health/all", post(handlers::health::check_all_accounts_health))
        
        // 用户管理
        .route("/api/users", get(handlers::users::list_users))
        .route("/api/users", post(handlers::users::create_user))
        .route("/api/users/:id", put(handlers::users::update_user))
        .route("/api/users/:id", delete(handlers::users::delete_user))
        
        // 上游账号管理
        .route("/api/accounts", get(handlers::accounts::list_accounts))
        .route("/api/accounts", post(handlers::accounts::create_account))
        .route("/api/accounts/:id", put(handlers::accounts::update_account))
        .route("/api/accounts/:id", delete(handlers::accounts::delete_account))
        .route("/api/accounts/:id/health-check", post(handlers::accounts::health_check_account))
        .route("/api/accounts/oauth/anthropic/generate-auth-url", post(handlers::accounts::generate_oauth_url))
        .route("/api/accounts/oauth/anthropic/exchange-code", post(handlers::accounts::exchange_oauth_code))
        
        // 统计数据
        .route("/api/stats/detailed", get(handlers::stats::get_detailed_stats))
        .route("/api/stats/basic", get(handlers::stats::get_basic_stats))
        
        .route_layer(middleware::from_fn_with_state(
            database.clone(),
            auth_middleware,
        ));

    // 需要API Key认证的路由
    let api_key_routes = Router::new()
        .route("/messages", post(handlers::proxy::proxy_messages))
        .route("/models", get(handlers::proxy::list_models))
        .route_layer(middleware::from_fn_with_state(
            database.clone(),
            api_key_middleware,
        ));

    // 公开路由
    let public_routes = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/api/health/system", get(handlers::health::get_system_health))
        .route("/api/health/cache", get(handlers::health::get_cache_metrics));

    // 检查是否存在构建的前端文件
    let frontend_dist_path = std::env::var("FRONTEND_DIST_PATH")
        .unwrap_or_else(|_| "../out".to_string()); // Next.js 导出的静态文件目录
    
    let final_app = if std::path::Path::new(&frontend_dist_path).exists() {
        tracing::info!("🌐 生产模式：服务静态文件从 {}", frontend_dist_path);
        
        // 组合 API 路由和静态文件服务
        Router::new()
            .merge(public_routes)
            .merge(auth_routes)
            .merge(protected_routes)
            .nest("/v1", api_key_routes.clone())
            .nest("/api/v1", api_key_routes) // 同时支持 /api/v1 前缀
            .fallback_service(ServeDir::new(&frontend_dist_path).append_index_html_on_directories(true))
            .with_state(database)
    } else {
        tracing::info!("🔧 开发模式：仅提供 API 服务");
        
        // 组合所有路由（开发模式）
        Router::new()
            .merge(public_routes)
            .merge(auth_routes)
            .merge(protected_routes)
            .nest("/v1", api_key_routes.clone())
            .nest("/api/v1", api_key_routes) // 同时支持 /api/v1 前缀
            .with_state(database)
    };
    
    let app = final_app
        // 全局中间件
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());
    
    Ok(app)
}