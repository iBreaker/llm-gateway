//! 缓存失效策略测试
//! 
//! 测试缓存在数据变更时的自动失效机制

#[cfg(test)]
mod tests {
    use super::super::{SimpleCache, AccountStats};
    use std::time::Duration;

    #[tokio::test]
    async fn test_cache_invalidation_on_removal() {
        let cache = SimpleCache::new(100);
        let account_id = 1i64;
        
        // 设置缓存数据
        let stats = AccountStats {
            account_id,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 200.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        
        cache.set_account_stats(account_id, stats, Duration::from_secs(300)).await;
        
        // 验证缓存存在
        assert!(cache.get_account_stats(account_id).await.is_some());
        
        // 手动失效缓存
        let removed = cache.remove_account_stats(account_id).await;
        assert!(removed);
        
        // 验证缓存已被清除
        assert!(cache.get_account_stats(account_id).await.is_none());
    }

    #[tokio::test]
    async fn test_remove_nonexistent_cache() {
        let cache = SimpleCache::new(100);
        let account_id = 999i64; // 不存在的账号ID
        
        // 尝试删除不存在的缓存
        let removed = cache.remove_account_stats(account_id).await;
        assert!(!removed); // 应该返回false，因为没有可删除的内容
    }

    #[tokio::test]
    async fn test_routing_decision_invalidation() {
        let cache = SimpleCache::new(100);
        let key = "test_api_key:claude-3";
        
        use super::super::cache_manager::RoutingDecision;
        let decision = RoutingDecision {
            account_id: 1,
            routing_weight: 0.8,
            estimated_response_time: 250,
            decided_at: chrono::Utc::now(),
        };
        
        // 设置路由决策缓存
        cache.set_routing_decision(key.to_string(), decision, Duration::from_secs(60)).await;
        
        // 验证缓存存在
        assert!(cache.get_routing_decision(key).await.is_some());
        
        // 手动失效缓存
        let removed = cache.remove_routing_decision(key).await;
        assert!(removed);
        
        // 验证缓存已被清除
        assert!(cache.get_routing_decision(key).await.is_none());
    }

    #[tokio::test]
    async fn test_multiple_cache_operations() {
        let cache = SimpleCache::new(100);
        
        // 设置多个账号的缓存
        for account_id in 1..=5 {
            let stats = AccountStats {
                account_id,
                request_count: account_id * 10,
                success_rate: 90.0 + account_id as f64,
                avg_response_time: 100.0 + account_id as f64 * 50.0,
                last_used_at: Some(chrono::Utc::now()),
            };
            cache.set_account_stats(account_id, stats, Duration::from_secs(300)).await;
        }
        
        // 验证所有缓存都存在
        for account_id in 1..=5 {
            assert!(cache.get_account_stats(account_id).await.is_some());
        }
        
        // 删除部分缓存
        assert!(cache.remove_account_stats(2).await);
        assert!(cache.remove_account_stats(4).await);
        
        // 验证删除的缓存不存在，其他的仍然存在
        assert!(cache.get_account_stats(1).await.is_some());
        assert!(cache.get_account_stats(2).await.is_none());
        assert!(cache.get_account_stats(3).await.is_some());
        assert!(cache.get_account_stats(4).await.is_none());
        assert!(cache.get_account_stats(5).await.is_some());
    }

    #[tokio::test]
    async fn test_clear_all_caches() {
        let cache = SimpleCache::new(100);
        
        // 设置各种类型的缓存数据
        let stats = AccountStats {
            account_id: 1,
            request_count: 100,
            success_rate: 95.0,
            avg_response_time: 200.0,
            last_used_at: Some(chrono::Utc::now()),
        };
        cache.set_account_stats(1, stats, Duration::from_secs(300)).await;
        cache.set_string("test_key".to_string(), "test_value".to_string(), Duration::from_secs(300)).await;
        
        use super::super::cache_manager::RoutingDecision;
        let decision = RoutingDecision {
            account_id: 1,
            routing_weight: 0.8,
            estimated_response_time: 250,
            decided_at: chrono::Utc::now(),
        };
        cache.set_routing_decision("test_route".to_string(), decision, Duration::from_secs(300)).await;
        
        // 验证所有缓存都存在
        assert!(cache.get_account_stats(1).await.is_some());
        assert!(cache.get_string("test_key").await.is_some());
        assert!(cache.get_routing_decision("test_route").await.is_some());
        
        // 清空所有缓存
        cache.clear_all().await;
        
        // 验证所有缓存都被清除
        assert!(cache.get_account_stats(1).await.is_none());
        assert!(cache.get_string("test_key").await.is_none());
        assert!(cache.get_routing_decision("test_route").await.is_none());
    }
}