//! 上游账号数据库操作
//! 
//! 实现上游账号的CRUD操作

use sqlx::PgPool;
use tracing::{error, info, instrument};
use chrono::Utc;
use serde_json;

use crate::business::domain::{UpstreamAccount, AccountProvider, AccountCredentials, HealthStatus};
use crate::shared::{AppError, AppResult};
use crate::shared::types::{UserId, UpstreamAccountId};

/// 上游账号数据库服务
#[derive(Debug, Clone)]
pub struct AccountsRepository {
    pool: PgPool,
}

impl AccountsRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
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
                provider,
                name,
                credentials,
                is_active,
                last_health_check,
                response_time_ms,
                error_count,
                error_message,
                created_at,
                updated_at
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
                let provider = match row.provider.as_str() {
                    "claude_code" => AccountProvider::ClaudeCode,
                    "gemini_cli" => AccountProvider::GeminiCli,
                    _ => AccountProvider::ClaudeCode, // 默认值
                };

                let credentials: AccountCredentials = serde_json::from_value(row.credentials)
                    .unwrap_or_else(|_| AccountCredentials {
                        session_key: None,
                        access_token: None,
                        refresh_token: None,
                        expires_at: None,
                    });

                let health_status = if row.error_count.unwrap_or(0) > 5 {
                    HealthStatus::Unhealthy
                } else if row.error_count.unwrap_or(0) > 2 {
                    HealthStatus::Degraded
                } else if row.last_health_check.is_some() {
                    HealthStatus::Healthy
                } else {
                    HealthStatus::Unknown
                };

                UpstreamAccount {
                    id: row.id,
                    user_id: row.user_id,
                    provider,
                    account_name: row.name,
                    credentials,
                    is_active: row.is_active,
                    health_status,
                    created_at: row.created_at,
                    last_health_check: row.last_health_check,
                }
            })
            .collect();

        info!("🔍 最终返回 {} 个上游账号", accounts.len());
        for account in &accounts {
            info!("🔍 账号详情: id={}, name={}, provider={:?}", account.id, account.account_name, account.provider);
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
                provider,
                name,
                credentials,
                is_active,
                last_health_check,
                response_time_ms,
                error_count,
                error_message,
                created_at,
                updated_at
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
            let provider = match row.provider.as_str() {
                "claude_code" => AccountProvider::ClaudeCode,
                "gemini_cli" => AccountProvider::GeminiCli,
                _ => AccountProvider::ClaudeCode,
            };

            let credentials: AccountCredentials = serde_json::from_value(row.credentials)
                .unwrap_or_else(|_| AccountCredentials {
                    session_key: None,
                    access_token: None,
                    refresh_token: None,
                    expires_at: None,
                });

            let health_status = if row.error_count.unwrap_or(0) > 5 {
                HealthStatus::Unhealthy
            } else if row.error_count.unwrap_or(0) > 2 {
                HealthStatus::Degraded
            } else if row.last_health_check.is_some() {
                HealthStatus::Healthy
            } else {
                HealthStatus::Unknown
            };

            Some(UpstreamAccount {
                id: row.id,
                user_id: row.user_id,
                provider,
                account_name: row.name,
                credentials,
                is_active: row.is_active,
                health_status,
                created_at: row.created_at,
                last_health_check: row.last_health_check,
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
        provider: &AccountProvider,
        name: &str,
        credentials: &AccountCredentials,
    ) -> AppResult<UpstreamAccount> {
        info!("创建上游账号: {} (提供商: {}, 用户: {})", name, provider.as_str(), user_id);

        let credentials_json = serde_json::to_value(credentials)
            .map_err(|e| {
                error!("凭据序列化错误: {}", e);
                AppError::Validation("凭据格式无效".to_string())
            })?;

        let row = sqlx::query!(
            r#"
            INSERT INTO upstream_accounts (
                user_id, 
                provider, 
                name, 
                credentials, 
                is_active,
                error_count
            ) 
            VALUES ($1, $2, $3, $4, true, 0)
            RETURNING 
                id,
                user_id,
                provider,
                name,
                credentials,
                is_active,
                last_health_check,
                response_time_ms,
                error_count,
                error_message,
                created_at,
                updated_at
            "#,
            user_id,
            provider.as_str(),
            name,
            credentials_json
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库插入错误: {}", e);
            AppError::Database(e)
        })?;

        let provider = match row.provider.as_str() {
            "claude_code" => AccountProvider::ClaudeCode,
            "gemini_cli" => AccountProvider::GeminiCli,
            _ => AccountProvider::ClaudeCode,
        };

        let credentials: AccountCredentials = serde_json::from_value(row.credentials)
            .unwrap_or_else(|_| AccountCredentials {
                session_key: None,
                access_token: None,
                refresh_token: None,
                expires_at: None,
            });

        let account = UpstreamAccount {
            id: row.id,
            user_id: row.user_id,
            provider,
            account_name: row.name,
            credentials,
            is_active: row.is_active,
            health_status: HealthStatus::Unknown,
            created_at: row.created_at,
            last_health_check: row.last_health_check,
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
        } else {
            info!("上游账号不存在或无权限删除: ID {}", account_id);
        }

        Ok(deleted)
    }

    /// 更新健康检查状态
    #[instrument(skip(self))]
    pub async fn update_health_status(
        &self,
        account_id: UpstreamAccountId,
        response_time_ms: Option<i32>,
        error_message: Option<&str>,
    ) -> AppResult<()> {
        info!("更新账号 {} 健康状态", account_id);

        let now = Utc::now();
        
        if let Some(error_msg) = error_message {
            // 错误情况：增加错误计数
            sqlx::query!(
                r#"
                UPDATE upstream_accounts 
                SET 
                    last_health_check = $1,
                    error_count = error_count + 1,
                    error_message = $2,
                    response_time_ms = $3
                WHERE id = $4
                "#,
                now,
                error_msg,
                response_time_ms.unwrap_or(0),
                account_id
            )
            .execute(&self.pool)
            .await
            .map_err(|e| {
                error!("更新健康状态失败: {}", e);
                AppError::Database(e)
            })?;
        } else {
            // 成功情况：重置错误计数
            sqlx::query!(
                r#"
                UPDATE upstream_accounts 
                SET 
                    last_health_check = $1,
                    error_count = 0,
                    error_message = NULL,
                    response_time_ms = $2
                WHERE id = $3
                "#,
                now,
                response_time_ms.unwrap_or(0),
                account_id
            )
            .execute(&self.pool)
            .await
            .map_err(|e| {
                error!("更新健康状态失败: {}", e);
                AppError::Database(e)
            })?;
        }

        info!("账号 {} 健康状态更新完成", account_id);
        Ok(())
    }
}