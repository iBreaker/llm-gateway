//! 内存缓存实现 (L1缓存)
//! 
//! 使用LRU算法实现高性能内存缓存
//! 主要用于：
//! - 路由决策
//! - 账号健康状态
//! - 高频访问的基础统计

use std::collections::HashMap;
use std::hash::Hash;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};
use tracing::{debug, warn};

use super::{CachedValue, CacheResult, CacheLayer};

/// LRU节点
#[derive(Debug)]
struct LruNode<K, V> {
    key: K,
    value: CachedValue<V>,
    prev: Option<usize>,
    next: Option<usize>,
}

/// 内存缓存实现
#[derive(Debug)]
pub struct MemoryCache<K, V> 
where
    K: Clone + Eq + Hash,
    V: Clone,
{
    /// 主要存储
    cache: HashMap<K, usize>,
    /// LRU链表节点池
    nodes: Vec<Option<LruNode<K, V>>>,
    /// 空闲节点栈
    free_nodes: Vec<usize>,
    /// 头节点索引
    head: Option<usize>,
    /// 尾节点索引
    tail: Option<usize>,
    /// 最大容量
    capacity: usize,
    /// 当前大小
    size: usize,
    /// 默认TTL
    default_ttl: Duration,
    /// 缓存统计
    hits: u64,
    misses: u64,
    evictions: u64,
}

impl<K, V> MemoryCache<K, V>
where
    K: Clone + Eq + Hash + Send + Sync + std::fmt::Debug,
    V: Clone + Send + Sync,
{
    pub fn new(capacity: usize, default_ttl: Duration) -> Self {
        Self {
            cache: HashMap::with_capacity(capacity),
            nodes: Vec::with_capacity(capacity * 2), // 预留一些空间避免频繁扩容
            free_nodes: Vec::with_capacity(capacity),
            head: None,
            tail: None,
            capacity,
            size: 0,
            default_ttl,
            hits: 0,
            misses: 0,
            evictions: 0,
        }
    }

    /// 获取缓存值
    pub fn get(&mut self, key: &K) -> CacheResult<V> {
        self.cleanup_expired();

        if let Some(&node_idx) = self.cache.get(key) {
            // 先检查节点是否存在且未过期
            let (is_valid, value) = if let Some(ref node) = self.nodes[node_idx] {
                if !node.value.is_expired() {
                    (true, Some(node.value.value.clone()))
                } else {
                    (false, None)
                }
            } else {
                (false, None)
            };

            if is_valid {
                self.hits += 1;
                // 移动到头部（最近访问）
                self.move_to_head(node_idx);
                debug!("内存缓存命中: key={:?}", key);
                return CacheResult::Hit(value.unwrap(), CacheLayer::Memory);
            } else {
                // 已过期，移除
                self.remove_node(node_idx);
                self.cache.remove(key);
            }
        }

        self.misses += 1;
        debug!("内存缓存未命中: key={:?}", key);
        CacheResult::Miss
    }

    /// 设置缓存值
    pub fn set(&mut self, key: K, value: V, ttl: Option<Duration>) -> Result<(), String> {
        let ttl = ttl.unwrap_or(self.default_ttl);
        let cached_value = CachedValue::new(value, ttl);

        // 如果key已存在，更新值
        if let Some(&node_idx) = self.cache.get(&key) {
            if let Some(ref mut node) = self.nodes[node_idx] {
                node.value = cached_value;
                self.move_to_head(node_idx);
                debug!("内存缓存更新: key={:?}, ttl={:?}", key, ttl);
                return Ok(());
            }
        }

        // 新增缓存项
        if self.size >= self.capacity {
            self.evict_lru();
        }

        let node_idx = self.allocate_node();
        self.nodes[node_idx] = Some(LruNode {
            key: key.clone(),
            value: cached_value,
            prev: None,
            next: self.head,
        });

        if let Some(head_idx) = self.head {
            if let Some(ref mut head_node) = self.nodes[head_idx] {
                head_node.prev = Some(node_idx);
            }
        } else {
            self.tail = Some(node_idx);
        }

        self.head = Some(node_idx);
        self.cache.insert(key.clone(), node_idx);
        self.size += 1;

        debug!("内存缓存设置: key={:?}, ttl={:?}, size={}", key, ttl, self.size);
        Ok(())
    }

    /// 移除指定key
    pub fn remove(&mut self, key: &K) -> bool {
        if let Some(&node_idx) = self.cache.get(key) {
            self.remove_node(node_idx);
            self.cache.remove(key);
            debug!("内存缓存移除: key={:?}", key);
            true
        } else {
            false
        }
    }

    /// 清空缓存
    pub fn clear(&mut self) {
        self.cache.clear();
        self.nodes.clear();
        self.free_nodes.clear();
        self.head = None;
        self.tail = None;
        self.size = 0;
        debug!("内存缓存已清空");
    }

    /// 获取缓存统计
    pub fn stats(&self) -> CacheStats {
        CacheStats {
            size: self.size,
            capacity: self.capacity,
            hits: self.hits,
            misses: self.misses,
            evictions: self.evictions,
            hit_rate: if self.hits + self.misses > 0 {
                self.hits as f64 / (self.hits + self.misses) as f64
            } else {
                0.0
            },
        }
    }

    /// 清理过期项
    fn cleanup_expired(&mut self) {
        let mut expired_keys = Vec::new();
        
        for (key, &node_idx) in &self.cache {
            if let Some(ref node) = self.nodes[node_idx] {
                if node.value.is_expired() {
                    expired_keys.push(key.clone());
                }
            }
        }

        for key in expired_keys {
            self.remove(&key);
        }
    }

    /// 分配新节点
    fn allocate_node(&mut self) -> usize {
        if let Some(idx) = self.free_nodes.pop() {
            idx
        } else {
            let idx = self.nodes.len();
            self.nodes.push(None);
            idx
        }
    }

    /// 移除节点
    fn remove_node(&mut self, node_idx: usize) {
        if let Some(node) = self.nodes[node_idx].take() {
            // 更新链表指针
            if let Some(prev_idx) = node.prev {
                if let Some(ref mut prev_node) = self.nodes[prev_idx] {
                    prev_node.next = node.next;
                }
            } else {
                self.head = node.next;
            }

            if let Some(next_idx) = node.next {
                if let Some(ref mut next_node) = self.nodes[next_idx] {
                    next_node.prev = node.prev;
                }
            } else {
                self.tail = node.prev;
            }

            self.free_nodes.push(node_idx);
            self.size -= 1;
        }
    }

    /// 移动节点到头部
    fn move_to_head(&mut self, node_idx: usize) {
        if self.head == Some(node_idx) {
            return; // 已经是头节点
        }

        // 从当前位置移除
        let (prev_idx, next_idx) = if let Some(ref node) = self.nodes[node_idx] {
            (node.prev, node.next)
        } else {
            return;
        };

        if let Some(prev_idx) = prev_idx {
            if let Some(ref mut prev_node) = self.nodes[prev_idx] {
                prev_node.next = next_idx;
            }
        }

        if let Some(next_idx) = next_idx {
            if let Some(ref mut next_node) = self.nodes[next_idx] {
                next_node.prev = prev_idx;
            }
        } else {
            self.tail = prev_idx;
        }

        // 移动到头部
        if let Some(ref mut node) = self.nodes[node_idx] {
            node.prev = None;
            node.next = self.head;
        }

        if let Some(head_idx) = self.head {
            if let Some(ref mut head_node) = self.nodes[head_idx] {
                head_node.prev = Some(node_idx);
            }
        } else {
            self.tail = Some(node_idx);
        }

        self.head = Some(node_idx);
    }

    /// 驱逐LRU项
    fn evict_lru(&mut self) {
        if let Some(tail_idx) = self.tail {
            if let Some(ref node) = self.nodes[tail_idx] {
                let key = node.key.clone();
                self.cache.remove(&key);
                self.remove_node(tail_idx);
                self.evictions += 1;
                warn!("内存缓存LRU驱逐: key={:?}", key);
            }
        }
    }
}

/// 线程安全的内存缓存包装器
#[derive(Debug, Clone)]
pub struct SharedMemoryCache<K, V>
where
    K: Clone + Eq + Hash + Send + Sync + std::fmt::Debug,
    V: Clone + Send + Sync,
{
    cache: Arc<RwLock<MemoryCache<K, V>>>,
}

impl<K, V> SharedMemoryCache<K, V>
where
    K: Clone + Eq + Hash + Send + Sync + std::fmt::Debug,
    V: Clone + Send + Sync,
{
    pub fn new(capacity: usize, default_ttl: Duration) -> Self {
        Self {
            cache: Arc::new(RwLock::new(MemoryCache::new(capacity, default_ttl))),
        }
    }

    pub async fn get(&self, key: &K) -> CacheResult<V> {
        let mut cache = self.cache.write().await;
        cache.get(key)
    }

    pub async fn set(&self, key: K, value: V, ttl: Option<Duration>) -> Result<(), String> {
        let mut cache = self.cache.write().await;
        cache.set(key, value, ttl)
    }

    pub async fn remove(&self, key: &K) -> bool {
        let mut cache = self.cache.write().await;
        cache.remove(key)
    }

    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear()
    }

    pub async fn stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        cache.stats()
    }
}

/// 缓存统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub size: usize,
    pub capacity: usize,
    pub hits: u64,
    pub misses: u64,
    pub evictions: u64,
    pub hit_rate: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_memory_cache_basic_operations() {
        let mut cache = MemoryCache::new(3, Duration::from_secs(60));

        // 测试设置和获取
        cache.set("key1".to_string(), "value1".to_string(), None).unwrap();
        let result = cache.get(&"key1".to_string());
        assert!(result.is_hit());

        // 测试未命中
        let result = cache.get(&"nonexistent".to_string());
        assert!(result.is_miss());
    }

    #[test]
    fn test_lru_eviction() {
        let mut cache = MemoryCache::new(2, Duration::from_secs(60));

        // 填满缓存
        cache.set("key1".to_string(), "value1".to_string(), None).unwrap();
        cache.set("key2".to_string(), "value2".to_string(), None).unwrap();
        
        // 添加第三个项，应该驱逐key1
        cache.set("key3".to_string(), "value3".to_string(), None).unwrap();

        assert!(cache.get(&"key1".to_string()).is_miss());
        assert!(cache.get(&"key2".to_string()).is_hit());
        assert!(cache.get(&"key3".to_string()).is_hit());
    }

    #[tokio::test]
    async fn test_shared_memory_cache() {
        let cache = SharedMemoryCache::new(10, Duration::from_secs(60));

        cache.set("test".to_string(), 42i32, None).await.unwrap();
        let result = cache.get(&"test".to_string()).await;
        assert!(result.is_hit());
        
        if let CacheResult::Hit(value, _) = result {
            assert_eq!(value, 42);
        }
    }
}