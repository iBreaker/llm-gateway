//! 上游账号数据库操作
//! 
//! 实现上游账号的CRUD操作

use sqlx::PgPool;
use tracing::{debug, error, info, instrument};
use serde_json;

use crate::business::domain::{UpstreamAccount, ProviderConfig, AccountCredentials};
use crate::shared::{AppError, AppResult};
use crate::shared::types::{UserId, UpstreamAccountId};
use crate::infrastructure::cache::{SimpleCache, AccountStats};

/// 上游账号数据库服务
#[derive(Debug, Clone)]
pub struct AccountsRepository {
    pool: PgPool,
    simple_cache: Option<SimpleCache>,
}

impl AccountsRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { 
            pool,
            simple_cache: None,
        }
    }

    pub fn with_cache(pool: PgPool, simple_cache: SimpleCache) -> Self {
        Self {
            pool,
            simple_cache: Some(simple_cache),
        }
    }

    /// 获取用户的所有上游账号
    #[instrument(skip(self))]
    pub async fn list_by_user_id(&self, user_id: UserId) -> AppResult<Vec<UpstreamAccount>> {
        info!("🔍 开始查询用户 {} 的上游账号列表", user_id);

        let rows = sqlx::query!(
            r#"
            SELECT 
                id,
                user_id,
                service_provider,
                auth_method,
                name,
                credentials,
                is_active,
                created_at,
                updated_at,
                oauth_expires_at,
                oauth_scopes
            FROM upstream_accounts 
            WHERE user_id = $1 
            ORDER BY created_at DESC
            "#,
            user_id
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库查询错误: {}", e);
            AppError::Database(e)
        })?;

        info!("🔍 数据库查询返回 {} 条记录", rows.len());

        let accounts: Vec<UpstreamAccount> = rows.into_iter()
            .map(|row| {
                info!("🔍 处理记录: id={}, name={}", row.id, row.name);
                
                let provider_config = ProviderConfig::from_database_fields(&row.service_provider, &row.auth_method)
                    .unwrap_or_else(|_| ProviderConfig::anthropic_api());

                let credentials: AccountCredentials = serde_json::from_value(row.credentials)
                    .unwrap_or_else(|_| AccountCredentials {
                        session_key: None,
                        access_token: None,
                        refresh_token: None,
                        expires_at: None,
                        base_url: None,
                    });

                UpstreamAccount {
                    id: row.id,
                    user_id: row.user_id,
                    provider_config,
                    account_name: row.name,
                    credentials,
                    is_active: row.is_active,
                    created_at: row.created_at,
                    oauth_expires_at: row.oauth_expires_at,
                    oauth_scopes: row.oauth_scopes,
                    proxy_config: None, // 默认无代理配置
                }
            })
            .collect();

        info!("🔍 最终返回 {} 个上游账号", accounts.len());
        for account in &accounts {
            info!("🔍 账号详情: id={}, name={}, provider={:?}", account.id, account.account_name, account.provider_config);
        }
        Ok(accounts)
    }

    /// 根据ID获取上游账号
    #[instrument(skip(self))]
    pub async fn get_by_id(&self, account_id: UpstreamAccountId, user_id: UserId) -> AppResult<Option<UpstreamAccount>> {
        info!("查询上游账号 {} (用户: {})", account_id, user_id);

        let row = sqlx::query!(
            r#"
            SELECT 
                id,
                user_id,
                service_provider,
                auth_method,
                name,
                credentials,
                is_active,
                created_at,
                updated_at,
                oauth_expires_at,
                oauth_scopes
            FROM upstream_accounts 
            WHERE id = $1 AND user_id = $2
            "#,
            account_id,
            user_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库查询错误: {}", e);
            AppError::Database(e)
        })?;

        let account = if let Some(row) = row {
            let provider_config = ProviderConfig::from_database_fields(&row.service_provider, &row.auth_method)
                .unwrap_or_else(|_| ProviderConfig::anthropic_api());

            let credentials: AccountCredentials = serde_json::from_value(row.credentials)
                .unwrap_or_else(|_| AccountCredentials {
                    session_key: None,
                    access_token: None,
                    refresh_token: None,
                    expires_at: None,
                    base_url: None,
                });

            Some(UpstreamAccount {
                id: row.id,
                user_id: row.user_id,
                provider_config,
                account_name: row.name,
                credentials,
                is_active: row.is_active,
                created_at: row.created_at,
                oauth_expires_at: row.oauth_expires_at,
                oauth_scopes: row.oauth_scopes,
                proxy_config: None, // 默认无代理配置
            })
        } else {
            None
        };

        Ok(account)
    }

    /// 创建上游账号
    #[instrument(skip(self, credentials))]
    pub async fn create(
        &self,
        user_id: UserId,
        provider_config: &ProviderConfig,
        name: &str,
        credentials: &AccountCredentials,
        base_url: Option<&str>,
    ) -> AppResult<UpstreamAccount> {
        info!("创建上游账号: {} (提供商: {:?}, 用户: {})", name, provider_config, user_id);

        let credentials_json = serde_json::to_value(credentials)
            .map_err(|e| {
                error!("凭据序列化错误: {}", e);
                AppError::Validation("凭据格式无效".to_string())
            })?;

        let row = sqlx::query!(
            r#"
            INSERT INTO upstream_accounts (
                user_id, 
                service_provider, 
                auth_method,
                name, 
                credentials, 
                is_active
            ) 
            VALUES ($1, $2, $3, $4, $5, true)
            RETURNING 
                id,
                user_id,
                service_provider,
                auth_method,
                name,
                credentials,
                is_active,
                created_at,
                updated_at,
                oauth_expires_at,
                oauth_scopes
            "#,
            user_id,
            provider_config.service_provider().as_str(),
            provider_config.auth_method().as_str(),
            name,
            credentials_json
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库插入错误: {}", e);
            AppError::Database(e)
        })?;

        let provider_config = ProviderConfig::from_database_fields(&row.service_provider, &row.auth_method)
            .unwrap_or_else(|_| ProviderConfig::anthropic_api());

        let credentials: AccountCredentials = serde_json::from_value(row.credentials)
            .unwrap_or_else(|_| AccountCredentials {
                session_key: None,
                access_token: None,
                refresh_token: None,
                expires_at: None,
                base_url: None,
            });

        let account = UpstreamAccount {
            id: row.id,
            user_id: row.user_id,
            provider_config,
            account_name: row.name,
            credentials,
            is_active: row.is_active,
            created_at: row.created_at,
            oauth_expires_at: row.oauth_expires_at,
            oauth_scopes: row.oauth_scopes,
            proxy_config: None, // 默认无代理配置
        };

        info!("上游账号创建成功: ID {}", account.id);
        Ok(account)
    }

    /// 更新上游账号
    #[instrument(skip(self, credentials))]
    pub async fn update(
        &self,
        account_id: UpstreamAccountId,
        user_id: UserId,
        name: Option<&str>,
        is_active: Option<bool>,
        credentials: Option<&AccountCredentials>,
    ) -> AppResult<Option<UpstreamAccount>> {
        info!("更新上游账号: ID {} (用户: {})", account_id, user_id);

        // 先检查账号是否存在且属于该用户
        let existing = self.get_by_id(account_id, user_id).await?;
        if existing.is_none() {
            return Ok(None);
        }

        // 为了简化，我们总是更新所有字段
        let update_name = name.unwrap_or(&existing.as_ref().unwrap().account_name);
        let update_is_active = is_active.unwrap_or(existing.as_ref().unwrap().is_active);
        
        let update_credentials = if let Some(creds) = credentials {
            serde_json::to_value(creds)
                .map_err(|e| {
                    error!("凭据序列化错误: {}", e);
                    AppError::Validation("凭据格式无效".to_string())
                })?
        } else {
            serde_json::to_value(&existing.as_ref().unwrap().credentials).unwrap()
        };

        // 执行更新
        let result = sqlx::query!(
            r#"
            UPDATE upstream_accounts 
            SET name = $1, is_active = $2, credentials = $3
            WHERE id = $4 AND user_id = $5
            "#,
            update_name,
            update_is_active,
            update_credentials,
            account_id,
            user_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库更新错误: {}", e);
            AppError::Database(e)
        })?;

        if result.rows_affected() == 0 {
            return Ok(None);
        }

        info!("上游账号更新成功: ID {}", account_id);
        
        // 更新完成后，失效相关缓存
        if let Some(ref cache) = self.simple_cache {
            if cache.remove_account_stats(account_id).await {
                debug!("清除账号 {} 的缓存统计，因为账号信息已更新", account_id);
            }
        }
        
        // 返回更新后的记录
        self.get_by_id(account_id, user_id).await
    }

    /// 删除上游账号
    #[instrument(skip(self))]
    pub async fn delete(&self, account_id: UpstreamAccountId, user_id: UserId) -> AppResult<bool> {
        info!("删除上游账号: ID {} (用户: {})", account_id, user_id);

        let result = sqlx::query!(
            "DELETE FROM upstream_accounts WHERE id = $1 AND user_id = $2",
            account_id,
            user_id
        )
        .execute(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库删除错误: {}", e);
            AppError::Database(e)
        })?;

        let deleted = result.rows_affected() > 0;
        if deleted {
            info!("上游账号删除成功: ID {}", account_id);
            
            // 删除完成后，失效相关缓存
            if let Some(ref cache) = self.simple_cache {
                if cache.remove_account_stats(account_id).await {
                    debug!("清除账号 {} 的缓存统计，因为账号已删除", account_id);
                }
            }
        } else {
            info!("上游账号不存在或无权限删除: ID {}", account_id);
        }

        Ok(deleted)
    }


    /// 获取账号的使用统计（带缓存）
    #[instrument(skip(self))]
    pub async fn get_account_statistics(&self, account_id: UpstreamAccountId) -> AppResult<(i64, f64)> {
        info!("查询账号 {} 的使用统计", account_id);

        // 尝试从缓存获取
        if let Some(ref cache) = self.simple_cache {
            if let Some(cached_stats) = cache.get_account_stats(account_id).await {
                info!("账号 {} 统计缓存命中", account_id);
                return Ok((cached_stats.request_count, cached_stats.success_rate));
            }
        }

        // 缓存未命中，从数据库查询
        let stats = sqlx::query!(
            r#"
            SELECT 
                COUNT(*) as total_requests,
                COUNT(CASE WHEN response_status >= 200 AND response_status < 300 THEN 1 END) as success_requests,
                COALESCE(AVG(CASE WHEN response_status >= 200 AND response_status < 300 THEN latency_ms END), 0) as avg_response_time
            FROM usage_records 
            WHERE upstream_account_id = $1
            "#,
            account_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            error!("查询使用统计失败: {}", e);
            AppError::Database(e)
        })?;

        let total_requests = stats.total_requests.unwrap_or(0);
        let success_requests = stats.success_requests.unwrap_or(0);
        let avg_response_time = stats.avg_response_time
            .map(|bd| bd.to_string().parse::<f64>().unwrap_or(0.0))
            .unwrap_or(0.0);
        
        let success_rate = if total_requests > 0 {
            (success_requests as f64 / total_requests as f64) * 100.0
        } else {
            0.0
        };

        // 缓存查询结果
        if let Some(ref cache) = self.simple_cache {
            let account_stats = AccountStats {
                account_id,
                request_count: total_requests,
                success_rate,
                avg_response_time,
                last_used_at: if total_requests > 0 {
                    Some(chrono::Utc::now())
                } else {
                    None
                },
            };
            
            cache.set_account_stats(account_id, account_stats, std::time::Duration::from_secs(300)).await;
            debug!("账号 {} 统计已缓存", account_id);
        }

        info!("账号 {} 统计结果: 总请求 {}, 成功率 {:.2}%", account_id, total_requests, success_rate);
        Ok((total_requests, success_rate))
    }
}