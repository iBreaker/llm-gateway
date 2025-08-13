//! 代理配置集成测试

use std::sync::Arc;
use sqlx::PgPool;
use tokio;

use llm_gateway_rust::infrastructure::database::Database;
use llm_gateway_rust::business::services::proxy_manager::SystemProxyManager;
use llm_gateway_rust::business::services::upstream_proxy_service::UpstreamProxyService;

#[tokio::test]
async fn test_proxy_configuration_integration() {
    // 连接到测试数据库
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://postgres:postgres@localhost/llm_gateway".to_string());
    
    let database = match Database::new_simple(&database_url).await {
        Ok(db) => db,
        Err(e) => {
            eprintln!("无法连接到数据库: {}. 跳过测试.", e);
            return;
        }
    };

    // 测试1: 读取代理配置
    let proxy_configs = database.proxies.list_all().await.expect("读取代理配置失败");
    println!("找到 {} 个代理配置", proxy_configs.len());
    
    // 测试2: 读取上游账号
    let accounts = database.accounts.list_by_user_id(1).await.expect("读取上游账号失败");
    println!("找到 {} 个上游账号", accounts.len());

    if !accounts.is_empty() && !proxy_configs.is_empty() {
        // 测试3: SystemProxyManager 初始化
        let proxy_manager = SystemProxyManager::new(database.proxies.clone());
        proxy_manager.initialize_from_database().await.expect("初始化代理管理器失败");
        
        let loaded_proxies = proxy_manager.list_proxies().await;
        println!("SystemProxyManager 加载了 {} 个代理", loaded_proxies.len());
        
        // 测试4: UpstreamProxyService 代理解析
        let upstream_proxy_service = UpstreamProxyService::new(Arc::new(proxy_manager));
        let first_account = &accounts[0];
        
        match upstream_proxy_service.resolve_proxy_for_account(first_account).await {
            Ok(Some(proxy)) => {
                println!("✅ 账号 {} 的代理解析成功: {} ({}://{}:{})", 
                      first_account.id, proxy.name, proxy.proxy_type.as_str(), proxy.host, proxy.port);
            }
            Ok(None) => {
                println!("ℹ️  账号 {} 未配置代理", first_account.id);
            }
            Err(e) => {
                panic!("账号 {} 的代理解析失败: {}", first_account.id, e);
            }
        }
    }
    
    println!("🎉 代理配置集成测试完成");
}