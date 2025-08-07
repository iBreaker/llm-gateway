//! Redis缓存实现 (L2缓存)
//! 
//! 基于Redis实现分布式缓存
//! 主要用于：
//! - 统计数据缓存
//! - 用户会话信息
//! - 跨实例共享的缓存数据

use std::time::Duration;
use serde::{Serialize, Deserialize, de::DeserializeOwned};
use tracing::{debug, error, info};

use super::{CacheResult, CacheLayer};

/// Redis缓存客户端封装
#[derive(Debug, Clone)]
pub struct RedisCache {
    client: redis::Client,
    key_prefix: String,
    default_ttl: Duration,
    #[allow(dead_code)]
    connection_pool_size: u32,
}

impl RedisCache {
    /// 创建新的Redis缓存实例
    pub fn new(
        redis_url: &str,
        key_prefix: String,
        default_ttl: Duration,
        pool_size: u32,
    ) -> Result<Self, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;
        
        Ok(Self {
            client,
            key_prefix,
            default_ttl,
            connection_pool_size: pool_size,
        })
    }

    /// 测试连接
    pub async fn ping(&self) -> Result<(), redis::RedisError> {
        let mut conn = self.get_connection().await?;
        redis::cmd("PING").query_async::<_, ()>(&mut conn).await?;
        info!("Redis连接测试成功");
        Ok(())
    }

    /// 获取连接
    async fn get_connection(&self) -> Result<redis::aio::Connection, redis::RedisError> {
        self.client.get_async_connection().await
    }

    /// 构建完整的缓存键
    fn build_key(&self, key: &str) -> String {
        format!("{}{}", self.key_prefix, key)
    }

    /// 获取缓存值
    pub async fn get<T>(&self, key: &str) -> CacheResult<T> 
    where 
        T: DeserializeOwned + Send + Sync,
    {
        let full_key = self.build_key(key);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                match redis::cmd("GET")
                    .arg(&full_key)
                    .query_async::<_, Option<String>>(&mut conn)
                    .await 
                {
                    Ok(Some(value)) => {
                        match serde_json::from_str::<T>(&value) {
                            Ok(deserialized) => {
                                debug!("Redis缓存命中: key={}", key);
                                CacheResult::Hit(deserialized, CacheLayer::Redis)
                            }
                            Err(e) => {
                                error!("Redis缓存反序列化失败: key={}, error={}", key, e);
                                CacheResult::Error(format!("反序列化失败: {}", e))
                            }
                        }
                    }
                    Ok(None) => {
                        debug!("Redis缓存未命中: key={}", key);
                        CacheResult::Miss
                    }
                    Err(e) => {
                        error!("Redis GET操作失败: key={}, error={}", key, e);
                        CacheResult::Error(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                CacheResult::Error(format!("连接失败: {}", e))
            }
        }
    }

    /// 设置缓存值
    pub async fn set<T>(&self, key: &str, value: &T, ttl: Option<Duration>) -> Result<(), String> 
    where 
        T: Serialize + Send + Sync,
    {
        let full_key = self.build_key(key);
        let ttl = ttl.unwrap_or(self.default_ttl);
        
        let serialized = serde_json::to_string(value)
            .map_err(|e| format!("序列化失败: {}", e))?;

        match self.get_connection().await {
            Ok(mut conn) => {
                let result = redis::cmd("SETEX")
                    .arg(&full_key)
                    .arg(ttl.as_secs())
                    .arg(&serialized)
                    .query_async::<_, ()>(&mut conn)
                    .await;

                match result {
                    Ok(_) => {
                        debug!("Redis缓存设置成功: key={}, ttl={:?}", key, ttl);
                        Ok(())
                    }
                    Err(e) => {
                        error!("Redis SET操作失败: key={}, error={}", key, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 删除缓存值
    pub async fn delete(&self, key: &str) -> Result<bool, String> {
        let full_key = self.build_key(key);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                match redis::cmd("DEL")
                    .arg(&full_key)
                    .query_async::<_, i32>(&mut conn)
                    .await 
                {
                    Ok(deleted_count) => {
                        let was_deleted = deleted_count > 0;
                        debug!("Redis缓存删除: key={}, deleted={}", key, was_deleted);
                        Ok(was_deleted)
                    }
                    Err(e) => {
                        error!("Redis DEL操作失败: key={}, error={}", key, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 批量删除缓存（通过模式匹配）
    pub async fn delete_pattern(&self, pattern: &str) -> Result<usize, String> {
        let full_pattern = self.build_key(pattern);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                // 先获取匹配的键
                let keys: Vec<String> = match redis::cmd("KEYS")
                    .arg(&full_pattern)
                    .query_async(&mut conn)
                    .await 
                {
                    Ok(keys) => keys,
                    Err(e) => {
                        error!("Redis KEYS操作失败: pattern={}, error={}", pattern, e);
                        return Err(format!("Redis错误: {}", e));
                    }
                };

                if keys.is_empty() {
                    return Ok(0);
                }

                // 批量删除
                match redis::cmd("DEL")
                    .arg(&keys)
                    .query_async::<_, i32>(&mut conn)
                    .await 
                {
                    Ok(deleted_count) => {
                        info!("Redis批量删除: pattern={}, deleted={}", pattern, deleted_count);
                        Ok(deleted_count as usize)
                    }
                    Err(e) => {
                        error!("Redis批量DEL操作失败: pattern={}, error={}", pattern, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 检查键是否存在
    pub async fn exists(&self, key: &str) -> Result<bool, String> {
        let full_key = self.build_key(key);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                match redis::cmd("EXISTS")
                    .arg(&full_key)
                    .query_async::<_, i32>(&mut conn)
                    .await 
                {
                    Ok(exists) => {
                        debug!("Redis EXISTS检查: key={}, exists={}", key, exists > 0);
                        Ok(exists > 0)
                    }
                    Err(e) => {
                        error!("Redis EXISTS操作失败: key={}, error={}", key, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 设置键的TTL
    pub async fn expire(&self, key: &str, ttl: Duration) -> Result<bool, String> {
        let full_key = self.build_key(key);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                match redis::cmd("EXPIRE")
                    .arg(&full_key)
                    .arg(ttl.as_secs())
                    .query_async::<_, i32>(&mut conn)
                    .await 
                {
                    Ok(result) => {
                        debug!("Redis EXPIRE设置: key={}, ttl={:?}, success={}", key, ttl, result > 0);
                        Ok(result > 0)
                    }
                    Err(e) => {
                        error!("Redis EXPIRE操作失败: key={}, error={}", key, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 获取键的剩余TTL
    pub async fn ttl(&self, key: &str) -> Result<i64, String> {
        let full_key = self.build_key(key);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                match redis::cmd("TTL")
                    .arg(&full_key)
                    .query_async::<_, i64>(&mut conn)
                    .await 
                {
                    Ok(ttl) => {
                        debug!("Redis TTL查询: key={}, ttl={}", key, ttl);
                        Ok(ttl)
                    }
                    Err(e) => {
                        error!("Redis TTL操作失败: key={}, error={}", key, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 原子性递增操作
    pub async fn incr(&self, key: &str, increment: i64, ttl: Option<Duration>) -> Result<i64, String> {
        let full_key = self.build_key(key);
        
        match self.get_connection().await {
            Ok(mut conn) => {
                // 使用MULTI/EXEC事务确保原子性
                let mut pipe = redis::pipe();
                pipe.cmd("INCRBY").arg(&full_key).arg(increment);
                
                if let Some(ttl) = ttl {
                    pipe.cmd("EXPIRE").arg(&full_key).arg(ttl.as_secs());
                }

                match pipe.query_async::<_, Vec<i64>>(&mut conn).await {
                    Ok(results) => {
                        let new_value = results[0];
                        debug!("Redis INCR操作: key={}, increment={}, new_value={}", key, increment, new_value);
                        Ok(new_value)
                    }
                    Err(e) => {
                        error!("Redis INCR操作失败: key={}, error={}", key, e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }

    /// 获取Redis信息统计
    pub async fn info(&self) -> Result<RedisInfo, String> {
        match self.get_connection().await {
            Ok(mut conn) => {
                match redis::cmd("INFO")
                    .arg("memory")
                    .query_async::<_, String>(&mut conn)
                    .await 
                {
                    Ok(info_str) => {
                        Ok(RedisInfo::parse(&info_str))
                    }
                    Err(e) => {
                        error!("Redis INFO操作失败: error={}", e);
                        Err(format!("Redis错误: {}", e))
                    }
                }
            }
            Err(e) => {
                error!("Redis连接失败: error={}", e);
                Err(format!("连接失败: {}", e))
            }
        }
    }
}

/// Redis信息统计
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RedisInfo {
    pub used_memory: u64,
    pub used_memory_human: String,
    pub used_memory_rss: u64,
    pub used_memory_peak: u64,
    pub total_system_memory: u64,
    pub maxmemory: u64,
    pub connected_clients: u32,
}

impl RedisInfo {
    fn parse(info_str: &str) -> Self {
        let mut info = RedisInfo::default();
        
        for line in info_str.lines() {
            if line.contains(':') {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() == 2 {
                    let key = parts[0];
                    let value = parts[1];
                    
                    match key {
                        "used_memory" => {
                            info.used_memory = value.parse().unwrap_or(0);
                        }
                        "used_memory_human" => {
                            info.used_memory_human = value.to_string();
                        }
                        "used_memory_rss" => {
                            info.used_memory_rss = value.parse().unwrap_or(0);
                        }
                        "used_memory_peak" => {
                            info.used_memory_peak = value.parse().unwrap_or(0);
                        }
                        "total_system_memory" => {
                            info.total_system_memory = value.parse().unwrap_or(0);
                        }
                        "maxmemory" => {
                            info.maxmemory = value.parse().unwrap_or(0);
                        }
                        "connected_clients" => {
                            info.connected_clients = value.parse().unwrap_or(0);
                        }
                        _ => {}
                    }
                }
            }
        }
        
        info
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // 需要Redis实例才能运行
    async fn test_redis_cache_operations() {
        let cache = RedisCache::new(
            "redis://localhost:6379",
            "test:".to_string(),
            Duration::from_secs(300),
            10,
        ).expect("Failed to create Redis cache");

        // 测试连接
        cache.ping().await.expect("Redis ping failed");

        // 测试设置和获取
        let test_data = "test_value";
        cache.set("test_key", &test_data, None).await.expect("Failed to set value");
        
        let result: CacheResult<String> = cache.get("test_key").await;
        assert!(result.is_hit());
        
        if let CacheResult::Hit(value, _) = result {
            assert_eq!(value, test_data);
        }

        // 测试删除
        let deleted = cache.delete("test_key").await.expect("Failed to delete");
        assert!(deleted);
        
        let result: CacheResult<String> = cache.get("test_key").await;
        assert!(result.is_miss());
    }
}