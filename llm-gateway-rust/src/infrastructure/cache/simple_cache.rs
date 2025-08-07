//! 简化版缓存实现
//! 
//! 为了避免复杂的泛型约束，实现专门针对LLM Gateway的缓存

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tracing::debug;

use super::cache_manager::{AccountStats, RoutingDecision};

/// 简化的缓存条目
#[derive(Debug, Clone)]
pub struct SimpleCacheEntry<T> {
    pub value: T,
    pub expires_at: Instant,
}

impl<T> SimpleCacheEntry<T> {
    pub fn new(value: T, ttl: Duration) -> Self {
        Self {
            value,
            expires_at: Instant::now() + ttl,
        }
    }

    pub fn is_expired(&self) -> bool {
        Instant::now() > self.expires_at
    }
}

/// 字符串缓存（用于通用缓存）
#[derive(Debug)]
pub struct StringCache {
    cache: HashMap<String, SimpleCacheEntry<String>>,
    max_size: usize,
}

impl StringCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            cache: HashMap::with_capacity(max_size),
            max_size,
        }
    }

    pub fn get(&mut self, key: &str) -> Option<String> {
        self.cleanup_expired();
        
        if let Some(entry) = self.cache.get(key) {
            if !entry.is_expired() {
                return Some(entry.value.clone());
            }
        }
        None
    }

    pub fn set(&mut self, key: String, value: String, ttl: Duration) {
        if self.cache.len() >= self.max_size && !self.cache.contains_key(&key) {
            // 简单的随机驱逐策略
            if let Some(key_to_remove) = self.cache.keys().next().cloned() {
                self.cache.remove(&key_to_remove);
            }
        }

        self.cache.insert(key, SimpleCacheEntry::new(value, ttl));
    }

    pub fn remove(&mut self, key: &str) -> bool {
        self.cache.remove(key).is_some()
    }

    fn cleanup_expired(&mut self) {
        let expired_keys: Vec<String> = self.cache
            .iter()
            .filter(|(_, entry)| entry.is_expired())
            .map(|(key, _)| key.clone())
            .collect();

        for key in expired_keys {
            self.cache.remove(&key);
        }
    }
}

/// 账号统计缓存
#[derive(Debug)]
pub struct AccountStatsCache {
    cache: HashMap<i64, SimpleCacheEntry<AccountStats>>,
    max_size: usize,
}

impl AccountStatsCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            cache: HashMap::with_capacity(max_size),
            max_size,
        }
    }

    pub fn get(&mut self, account_id: i64) -> Option<AccountStats> {
        self.cleanup_expired();
        
        if let Some(entry) = self.cache.get(&account_id) {
            if !entry.is_expired() {
                return Some(entry.value.clone());
            }
        }
        None
    }

    pub fn set(&mut self, account_id: i64, stats: AccountStats, ttl: Duration) {
        if self.cache.len() >= self.max_size && !self.cache.contains_key(&account_id) {
            // 驱逐最老的条目
            if let Some(&key_to_remove) = self.cache.keys().next() {
                self.cache.remove(&key_to_remove);
            }
        }

        self.cache.insert(account_id, SimpleCacheEntry::new(stats, ttl));
    }

    pub fn remove(&mut self, account_id: i64) -> bool {
        self.cache.remove(&account_id).is_some()
    }

    fn cleanup_expired(&mut self) {
        let expired_keys: Vec<i64> = self.cache
            .iter()
            .filter(|(_, entry)| entry.is_expired())
            .map(|(&key, _)| key)
            .collect();

        for key in expired_keys {
            self.cache.remove(&key);
        }
    }
}

/// 路由决策缓存
#[derive(Debug)]
pub struct RoutingCache {
    cache: HashMap<String, SimpleCacheEntry<RoutingDecision>>,
    max_size: usize,
}

impl RoutingCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            cache: HashMap::with_capacity(max_size),
            max_size,
        }
    }

    pub fn get(&mut self, key: &str) -> Option<RoutingDecision> {
        self.cleanup_expired();
        
        if let Some(entry) = self.cache.get(key) {
            if !entry.is_expired() {
                return Some(entry.value.clone());
            }
        }
        None
    }

    pub fn set(&mut self, key: String, decision: RoutingDecision, ttl: Duration) {
        if self.cache.len() >= self.max_size && !self.cache.contains_key(&key) {
            // 驱逐最老的条目
            if let Some(key_to_remove) = self.cache.keys().next().cloned() {
                self.cache.remove(&key_to_remove);
            }
        }

        self.cache.insert(key, SimpleCacheEntry::new(decision, ttl));
    }

    pub fn remove(&mut self, key: &str) -> bool {
        self.cache.remove(key).is_some()
    }

    fn cleanup_expired(&mut self) {
        let expired_keys: Vec<String> = self.cache
            .iter()
            .filter(|(_, entry)| entry.is_expired())
            .map(|(key, _)| key.clone())
            .collect();

        for key in expired_keys {
            self.cache.remove(&key);
        }
    }
}

/// 线程安全的简化缓存管理器
#[derive(Debug)]
pub struct SimpleCache {
    string_cache: Arc<RwLock<StringCache>>,
    account_stats_cache: Arc<RwLock<AccountStatsCache>>,
    routing_cache: Arc<RwLock<RoutingCache>>,
}

impl SimpleCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            string_cache: Arc::new(RwLock::new(StringCache::new(capacity))),
            account_stats_cache: Arc::new(RwLock::new(AccountStatsCache::new(capacity / 4))),
            routing_cache: Arc::new(RwLock::new(RoutingCache::new(capacity / 2))),
        }
    }

    pub async fn get_string(&self, key: &str) -> Option<String> {
        let mut cache = self.string_cache.write().await;
        cache.get(key)
    }

    pub async fn set_string(&self, key: String, value: String, ttl: Duration) {
        let mut cache = self.string_cache.write().await;
        cache.set(key, value, ttl)
    }

    pub async fn get_account_stats(&self, account_id: i64) -> Option<AccountStats> {
        let mut cache = self.account_stats_cache.write().await;
        cache.get(account_id)
    }

    pub async fn set_account_stats(&self, account_id: i64, stats: AccountStats, ttl: Duration) {
        let mut cache = self.account_stats_cache.write().await;
        cache.set(account_id, stats, ttl)
    }

    pub async fn get_routing_decision(&self, key: &str) -> Option<RoutingDecision> {
        let mut cache = self.routing_cache.write().await;
        cache.get(key)
    }

    pub async fn set_routing_decision(&self, key: String, decision: RoutingDecision, ttl: Duration) {
        let mut cache = self.routing_cache.write().await;
        cache.set(key, decision, ttl)
    }

    pub async fn remove_account_stats(&self, account_id: i64) -> bool {
        let mut cache = self.account_stats_cache.write().await;
        cache.remove(account_id)
    }

    pub async fn remove_routing_decision(&self, key: &str) -> bool {
        let mut cache = self.routing_cache.write().await;
        cache.remove(key)
    }

    pub async fn clear_all(&self) {
        {
            let mut cache = self.string_cache.write().await;
            cache.cache.clear();
        }
        {
            let mut cache = self.account_stats_cache.write().await;
            cache.cache.clear();
        }
        {
            let mut cache = self.routing_cache.write().await;
            cache.cache.clear();
        }
        debug!("所有简化缓存已清空");
    }
}

impl Clone for SimpleCache {
    fn clone(&self) -> Self {
        Self {
            string_cache: Arc::clone(&self.string_cache),
            account_stats_cache: Arc::clone(&self.account_stats_cache),
            routing_cache: Arc::clone(&self.routing_cache),
        }
    }
}