//! 代理配置数据库操作
//! 
//! 实现代理配置的CRUD操作

use sqlx::PgPool;
use tracing::{error, info, instrument};

use crate::business::domain::{ProxyConfig, ProxyType, ProxyAuth};
use crate::shared::{AppError, AppResult};

/// 代理配置数据库服务
#[derive(Debug, Clone)]
pub struct ProxyRepository {
    pool: PgPool,
}

impl ProxyRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// 根据ID获取代理配置
    #[instrument(skip(self))]
    pub async fn get_by_id(&self, proxy_id: &str) -> AppResult<Option<ProxyConfig>> {
        info!("查询代理配置: {}", proxy_id);

        let row = sqlx::query!(
            r#"
            SELECT 
                id,
                name,
                proxy_type,
                host,
                port,
                auth_username,
                auth_password,
                enabled,
                extra_config
            FROM proxy_configs 
            WHERE id = $1
            "#,
            proxy_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库查询错误: {}", e);
            AppError::Database(e)
        })?;

        let proxy_config = if let Some(row) = row {
            let proxy_type = ProxyType::from_str(&row.proxy_type)
                .ok_or_else(|| AppError::Validation(format!("无效的代理类型: {}", row.proxy_type)))?;

            let auth = if let (Some(username), Some(password)) = (row.auth_username, row.auth_password) {
                Some(ProxyAuth { username, password })
            } else {
                None
            };

            let extra_config = row.extra_config
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_else(|| std::collections::HashMap::new());

            Some(ProxyConfig {
                id: row.id,
                name: row.name,
                proxy_type,
                host: row.host,
                port: row.port as u16,
                auth,
                enabled: row.enabled,
                extra_config,
            })
        } else {
            None
        };

        Ok(proxy_config)
    }

    /// 获取所有启用的代理配置
    #[instrument(skip(self))]
    pub async fn list_enabled(&self) -> AppResult<Vec<ProxyConfig>> {
        info!("查询所有启用的代理配置");

        let rows = sqlx::query!(
            r#"
            SELECT 
                id,
                name,
                proxy_type,
                host,
                port,
                auth_username,
                auth_password,
                enabled,
                extra_config
            FROM proxy_configs 
            WHERE enabled = true
            ORDER BY name
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库查询错误: {}", e);
            AppError::Database(e)
        })?;

        let proxy_configs: Result<Vec<ProxyConfig>, AppError> = rows.into_iter()
            .map(|row| {
                let proxy_type = ProxyType::from_str(&row.proxy_type)
                    .ok_or_else(|| AppError::Validation(format!("无效的代理类型: {}", row.proxy_type)))?;

                let auth = if let (Some(username), Some(password)) = (row.auth_username, row.auth_password) {
                    Some(ProxyAuth { username, password })
                } else {
                    None
                };

                let extra_config = row.extra_config
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_else(|| std::collections::HashMap::new());

                Ok(ProxyConfig {
                    id: row.id,
                    name: row.name,
                    proxy_type,
                    host: row.host,
                    port: row.port as u16,
                    auth,
                    enabled: row.enabled,
                    extra_config,
                })
            })
            .collect();

        proxy_configs
    }

    /// 获取所有代理配置
    #[instrument(skip(self))]
    pub async fn list_all(&self) -> AppResult<Vec<ProxyConfig>> {
        info!("查询所有代理配置");

        let rows = sqlx::query!(
            r#"
            SELECT 
                id,
                name,
                proxy_type,
                host,
                port,
                auth_username,
                auth_password,
                enabled,
                extra_config
            FROM proxy_configs 
            ORDER BY name
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| {
            error!("数据库查询错误: {}", e);
            AppError::Database(e)
        })?;

        let proxy_configs: Result<Vec<ProxyConfig>, AppError> = rows.into_iter()
            .map(|row| {
                let proxy_type = ProxyType::from_str(&row.proxy_type)
                    .ok_or_else(|| AppError::Validation(format!("无效的代理类型: {}", row.proxy_type)))?;

                let auth = if let (Some(username), Some(password)) = (row.auth_username, row.auth_password) {
                    Some(ProxyAuth { username, password })
                } else {
                    None
                };

                let extra_config = row.extra_config
                    .and_then(|v| serde_json::from_value(v).ok())
                    .unwrap_or_else(|| std::collections::HashMap::new());

                Ok(ProxyConfig {
                    id: row.id,
                    name: row.name,
                    proxy_type,
                    host: row.host,
                    port: row.port as u16,
                    auth,
                    enabled: row.enabled,
                    extra_config,
                })
            })
            .collect();

        proxy_configs
    }
}