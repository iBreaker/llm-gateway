//! 路由配置模块
//! 
//! 组织和配置所有HTTP路由

use axum::{
    middleware,
    routing::{delete, get, post, put},
    Router,
    response::Response,
    extract::Request,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer, services::ServeDir};
use axum::middleware::Next;
use tower::{ServiceBuilder, Layer};
use std::time::Duration;

use crate::infrastructure::Database;
use crate::presentation::handlers;
use crate::auth::middleware::{auth_middleware, api_key_middleware};
use crate::business::services::{SharedSettingsService, SharedRateLimitService};

/// 应用状态
#[derive(Clone)]
pub struct AppState {
    pub database: Database,
    pub settings_service: SharedSettingsService,
    pub rate_limit_service: SharedRateLimitService,
}

/// 连接管理中间件，专门解决 Node.js fetch 的连接问题
async fn connection_middleware(req: Request, next: Next) -> Response {
    use tracing::{info, warn};
    
    // 获取User-Agent来识别Node.js请求
    let user_agent = req.headers()
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    
    let is_nodejs = user_agent.contains("Node.js") || user_agent.contains("undici");
    
    if is_nodejs {
        info!("🔧 检测到Node.js请求，应用连接优化");
    }
    
    let mut response = next.run(req).await;
    
    // 为Node.js请求添加特殊头部
    if is_nodejs {
        response.headers_mut().insert(
            "Connection", 
            "close".parse().unwrap()  // 强制关闭连接，避免keep-alive问题
        );
        response.headers_mut().insert(
            "Cache-Control",
            "no-cache".parse().unwrap()  // 禁用缓存避免连接复用问题
        );
    }
    
    response
}

/// 创建应用路由
pub async fn create_routes(mut database: Database, settings_service: SharedSettingsService, rate_limit_service: SharedRateLimitService) -> anyhow::Result<Router> {
    // 为缓存管理器设置设置服务引用，以便动态使用系统设置中的缓存配置
    database.set_cache_settings_service(settings_service.clone());
    
    let app_state = AppState {
        database: database.clone(),
        settings_service: settings_service.clone(),
        rate_limit_service: rate_limit_service.clone(),
    };
    // 认证相关路由（公开）
    let auth_routes = Router::new()
        .route("/api/auth/login", post(handlers::auth::login))
        .route("/api/auth/refresh", post(handlers::auth::refresh_token))
        .with_state(app_state.clone());

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
        
        
        // 手动健康检查管理
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
        
        // OAuth授权管理
        .route("/api/oauth/anthropic/generate-auth-url", post(handlers::oauth::generate_anthropic_auth_url))
        .route("/api/oauth/anthropic/exchange-code", post(handlers::oauth::exchange_anthropic_code))
        .route("/api/oauth/anthropic/refresh-token/:id", post(handlers::oauth::refresh_anthropic_token))
        
        // 统计数据
        .route("/api/stats/detailed", get(handlers::stats::get_detailed_stats))
        .route("/api/stats/basic", get(handlers::stats::get_basic_stats))
        
        // 系统设置管理
        .route("/api/settings", get(handlers::settings::get_settings))
        .route("/api/settings", put(handlers::settings::update_settings))
        .route("/api/settings/:key", get(handlers::settings::get_setting))
        
        // 代理测试
        .route("/api/proxy/test", post(handlers::proxy_test::test_proxy_connection))
        
        // 代理管理
        .route("/api/proxies", get(handlers::proxy_management::list_proxies))
        .route("/api/proxies", post(handlers::proxy_management::create_proxy))
        .route("/api/proxies/:id", put(handlers::proxy_management::update_proxy))
        .route("/api/proxies/:id", delete(handlers::proxy_management::delete_proxy))
        .route("/api/proxies/default", post(handlers::proxy_management::set_default_proxy))
        .route("/api/proxies/global", post(handlers::proxy_management::toggle_global_proxy))
        
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware,
        ));

    // 需要API Key认证的路由
    let api_key_routes = Router::new()
        .route("/messages", post(handlers::proxy::proxy_messages))
        .route("/models", get(handlers::proxy::list_models))
        .with_state(app_state.clone())
        .route_layer(middleware::from_fn_with_state(
            app_state.clone(),
            api_key_middleware,
        ));

    // 公开路由
    let public_routes = Router::new()
        .route("/health", get(handlers::health::health_check))
        .route("/api/health/system", get(handlers::health::get_system_health))
        .route("/api/health/cache", get(handlers::health::get_cache_metrics))
        .with_state(app_state.clone());

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
            .with_state(app_state.clone())
    } else {
        tracing::info!("🔧 开发模式：仅提供 API 服务");
        
        // 组合所有路由（开发模式）
        Router::new()
            .merge(public_routes)
            .merge(auth_routes)
            .merge(protected_routes)
            .nest("/v1", api_key_routes.clone())
            .nest("/api/v1", api_key_routes) // 同时支持 /api/v1 前缀
            .with_state(app_state.clone())
    };
    
    let app = final_app
        // 全局中间件
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(connection_middleware))  // 连接管理中间件
        .layer(
            CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any) 
                .allow_headers(tower_http::cors::Any)
                .expose_headers(tower_http::cors::Any)
                .allow_credentials(false)  // 明确禁用凭据，简化CORS
        );
    
    Ok(app)
}