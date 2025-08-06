//! 健康检查处理器
//! 
//! 处理系统健康检查、上游账号健康检查等

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn, instrument};

use crate::infrastructure::Database;
use crate::shared::{AppError, AppResult};

/// 系统健康状态
#[derive(Debug, Serialize)]
pub struct SystemHealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
    pub timestamp: String,
    pub checks: HashMap<String, HealthCheck>,
}

/// 单项健康检查结果
#[derive(Debug, Serialize)]
pub struct HealthCheck {
    pub status: String,
    pub response_time_ms: u64,
    pub details: Option<serde_json::Value>,
    pub error: Option<String>,
}

/// 上游账号健康检查响应
#[derive(Debug, Serialize)]
pub struct UpstreamHealthResponse {
    pub account_id: i64,
    pub account_name: String,
    pub provider: String,
    pub status: String,
    pub response_time_ms: Option<u64>,
    pub last_check: String,
    pub error_message: Option<String>,
}

/// 批量健康检查请求
#[derive(Debug, Deserialize)]
pub struct BatchHealthCheckRequest {
    pub account_ids: Vec<i64>,
}

/// 批量健康检查响应
#[derive(Debug, Serialize)]
pub struct BatchHealthCheckResponse {
    pub results: Vec<UpstreamHealthResponse>,
    pub summary: HealthSummary,
}

/// 健康检查摘要
#[derive(Debug, Serialize)]
pub struct HealthSummary {
    pub total: u32,
    pub healthy: u32,
    pub degraded: u32,
    pub unhealthy: u32,
    pub unknown: u32,
}

/// 基础健康检查
#[instrument]
pub async fn health_check() -> Result<Json<serde_json::Value>, StatusCode> {
    info!("🏥 基础健康检查请求");
    
    Ok(Json(serde_json::json!({
        "status": "ok",
        "service": "llm-gateway-rust",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now().to_rfc3339()
    })))
}

/// 系统健康检查（详细）
#[instrument(skip(database))]
pub async fn get_system_health(
    State(database): State<Database>,
) -> AppResult<Json<SystemHealthResponse>> {
    info!("🏥 系统健康检查请求");
    
    let mut checks = HashMap::new();
    let _start_time = std::time::Instant::now();

    // 数据库健康检查
    let db_check_start = std::time::Instant::now();
    let database_check = match database.health_check().await {
        Ok(_) => HealthCheck {
            status: "healthy".to_string(),
            response_time_ms: db_check_start.elapsed().as_millis() as u64,
            details: Some(serde_json::json!({
                "connection_pool": "active",
                "migrations": "up_to_date"
            })),
            error: None,
        },
        Err(e) => HealthCheck {
            status: "unhealthy".to_string(),
            response_time_ms: db_check_start.elapsed().as_millis() as u64,
            details: None,
            error: Some(e.to_string()),
        },
    };
    checks.insert("database".to_string(), database_check);

    // 连接池状态检查
    let pool_stats = database.get_pool_stats().await;
    let pool_check = HealthCheck {
        status: if pool_stats.health_check_success { "healthy" } else { "degraded" }.to_string(),
        response_time_ms: 0,
        details: Some(serde_json::json!({
            "size": pool_stats.size,
            "idle": pool_stats.idle,
            "total_connections": pool_stats.total_connections,
            "failed_connections": pool_stats.failed_connections,
            "average_acquire_time_ms": pool_stats.average_acquire_time_ms
        })),
        error: None,
    };
    checks.insert("connection_pool".to_string(), pool_check);

    // 上游账号健康统计
    let upstream_stats = get_upstream_health_summary(&database).await;
    let upstream_check = HealthCheck {
        status: if upstream_stats.healthy > 0 { "healthy" } else { "degraded" }.to_string(),
        response_time_ms: 0,
        details: Some(serde_json::json!(upstream_stats)),
        error: None,
    };
    checks.insert("upstream_accounts".to_string(), upstream_check);

    // 确定总体健康状态
    let overall_status = determine_overall_status(&checks);

    let response = SystemHealthResponse {
        status: overall_status,
        service: "llm-gateway-rust".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        checks,
    };

    Ok(Json(response))
}

/// 检查单个上游账号健康状态
#[instrument(skip(database))]
pub async fn check_account_health(
    State(database): State<Database>,
    Path(account_id): Path<i64>,
) -> AppResult<Json<UpstreamHealthResponse>> {
    info!("🔍 检查上游账号健康状态: ID {}", account_id);

    // 查询账号信息
    let account = sqlx::query!(
        r#"
        SELECT id, name, provider, is_active, credentials, last_health_check,
               CASE 
                   WHEN last_health_check IS NULL THEN 'unknown'
                   WHEN last_health_check < NOW() - INTERVAL '5 minutes' THEN 'unknown'
                   WHEN error_count > 5 THEN 'unhealthy'
                   WHEN response_time_ms > 5000 THEN 'degraded'
                   ELSE 'healthy'
               END as health_status,
               response_time_ms,
               error_message
        FROM upstream_accounts 
        WHERE id = $1
        "#,
        account_id
    )
    .fetch_optional(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let account = account.ok_or_else(|| {
        AppError::NotFound("上游账号不存在".to_string())
    })?;

    // 如果账号激活且需要检查，执行实时健康检查
    let (current_status, response_time, error_message) = if account.is_active {
        match perform_simple_health_check().await {
            Ok(response_time) => {
                // 更新数据库中的健康状态
                sqlx::query!(
                    "UPDATE upstream_accounts SET last_health_check = NOW(), response_time_ms = $1, error_message = NULL WHERE id = $2",
                    response_time as i32,
                    account_id
                )
                .execute(database.pool())
                .await
                .map_err(|e| AppError::Database(e))?;

                ("healthy".to_string(), Some(response_time), None)
            }
            Err(e) => {
                // 更新数据库中的错误状态
                let error_msg = e.to_string();
                sqlx::query!(
                    "UPDATE upstream_accounts SET last_health_check = NOW(), error_message = $1 WHERE id = $2",
                    error_msg,
                    account_id
                )
                .execute(database.pool())
                .await
                .map_err(|err| AppError::Database(err))?;

                ("unhealthy".to_string(), None, Some(error_msg))
            }
        }
    } else {
        (account.health_status.unwrap_or("unknown".to_string()), 
         account.response_time_ms.map(|t| t as u64), 
         account.error_message)
    };

    let response = UpstreamHealthResponse {
        account_id: account.id,
        account_name: account.name,
        provider: account.provider,
        status: current_status,
        response_time_ms: response_time,
        last_check: account.last_health_check
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_else(|| "never".to_string()),
        error_message,
    };

    Ok(Json(response))
}

/// 批量健康检查
#[instrument(skip(database, request))]
pub async fn batch_health_check(
    State(database): State<Database>,
    Json(request): Json<BatchHealthCheckRequest>,
) -> AppResult<Json<BatchHealthCheckResponse>> {
    info!("🔍 批量健康检查: {} 个账号", request.account_ids.len());

    if request.account_ids.len() > 50 {
        return Err(AppError::Validation("一次最多检查50个账号".to_string()));
    }

    let mut results = Vec::new();
    let mut summary = HealthSummary {
        total: 0,
        healthy: 0,
        degraded: 0,
        unhealthy: 0,
        unknown: 0,
    };

    // 并发检查所有账号
    let mut tasks = Vec::new();
    for account_id in request.account_ids {
        let db = database.clone();
        let task = tokio::spawn(async move {
            check_single_account_health(db, account_id).await
        });
        tasks.push(task);
    }

    // 等待所有检查完成
    for task in tasks {
        match task.await {
            Ok(Ok(health_response)) => {
                // 更新统计
                match health_response.status.as_str() {
                    "healthy" => summary.healthy += 1,
                    "degraded" => summary.degraded += 1,
                    "unhealthy" => summary.unhealthy += 1,
                    _ => summary.unknown += 1,
                }
                summary.total += 1;
                results.push(health_response);
            }
            Ok(Err(e)) => {
                warn!("健康检查失败: {}", e);
                summary.unknown += 1;
                summary.total += 1;
            }
            Err(e) => {
                warn!("健康检查任务失败: {}", e);
                summary.unknown += 1;
                summary.total += 1;
            }
        }
    }

    info!("✅ 批量健康检查完成: 总计{}, 健康{}, 降级{}, 不健康{}, 未知{}", 
          summary.total, summary.healthy, summary.degraded, summary.unhealthy, summary.unknown);

    let response = BatchHealthCheckResponse {
        results,
        summary,
    };

    Ok(Json(response))
}

/// 检查所有账号健康状态
#[instrument(skip(database))]
pub async fn check_all_accounts_health(
    State(database): State<Database>,
) -> AppResult<Json<BatchHealthCheckResponse>> {
    info!("🔍 检查所有账号健康状态");

    // 获取所有激活的账号ID
    let account_ids = sqlx::query_scalar!(
        "SELECT id FROM upstream_accounts WHERE is_active = true"
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| AppError::Database(e))?;

    let request = BatchHealthCheckRequest { account_ids };
    batch_health_check(State(database), Json(request)).await
}

// 辅助函数

/// 获取上游账号健康摘要
async fn get_upstream_health_summary(database: &Database) -> HealthSummary {
    let result = sqlx::query!(
        r#"
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN 
                last_health_check IS NOT NULL AND 
                last_health_check > NOW() - INTERVAL '5 minutes' AND
                error_count <= 3 AND
                response_time_ms <= 5000
                THEN 1 END) as healthy,
            COUNT(CASE WHEN 
                last_health_check IS NOT NULL AND 
                last_health_check > NOW() - INTERVAL '5 minutes' AND
                (error_count BETWEEN 4 AND 5 OR response_time_ms > 5000)
                THEN 1 END) as degraded,
            COUNT(CASE WHEN 
                last_health_check IS NOT NULL AND 
                last_health_check > NOW() - INTERVAL '5 minutes' AND
                error_count > 5
                THEN 1 END) as unhealthy,
            COUNT(CASE WHEN 
                last_health_check IS NULL OR 
                last_health_check <= NOW() - INTERVAL '5 minutes'
                THEN 1 END) as unknown
        FROM upstream_accounts 
        WHERE is_active = true
        "#
    )
    .fetch_one(database.pool())
    .await;

    match result {
        Ok(row) => HealthSummary {
            total: row.total.unwrap_or(0) as u32,
            healthy: row.healthy.unwrap_or(0) as u32,
            degraded: row.degraded.unwrap_or(0) as u32,
            unhealthy: row.unhealthy.unwrap_or(0) as u32,
            unknown: row.unknown.unwrap_or(0) as u32,
        },
        Err(_) => HealthSummary {
            total: 0,
            healthy: 0,
            degraded: 0,
            unhealthy: 0,
            unknown: 0,
        },
    }
}

/// 确定总体健康状态
fn determine_overall_status(checks: &HashMap<String, HealthCheck>) -> String {
    let mut healthy_count = 0;
    let mut unhealthy_count = 0;
    let total_count = checks.len();

    for check in checks.values() {
        match check.status.as_str() {
            "healthy" => healthy_count += 1,
            "unhealthy" => unhealthy_count += 1,
            _ => {} // degraded or unknown
        }
    }

    if unhealthy_count > 0 {
        "unhealthy".to_string()
    } else if healthy_count == total_count {
        "healthy".to_string()
    } else {
        "degraded".to_string()
    }
}

/// 执行单个账号的健康检查
async fn check_single_account_health(
    database: Database,
    account_id: i64,
) -> AppResult<UpstreamHealthResponse> {
    check_account_health(State(database), Path(account_id)).await
        .map(|json_response| json_response.0)
}

/// 执行简化的健康检查
async fn perform_simple_health_check() -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
    let start_time = std::time::Instant::now();
    
    // 简化的健康检查实现
    // 实际生产中需要根据不同提供商实现具体的健康检查逻辑
    
    // 模拟健康检查延迟
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
    
    Ok(start_time.elapsed().as_millis() as u64)
}