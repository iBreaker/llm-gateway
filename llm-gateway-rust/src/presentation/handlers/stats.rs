//! 统计数据处理器
//! 
//! 处理使用统计和分析数据

use axum::{
    extract::{Query, State},
    response::Json,
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::{info, instrument};
use std::collections::HashMap;

use crate::infrastructure::Database;
use crate::shared::AppResult;
use crate::auth::Claims;

/// 统计查询参数
#[derive(Debug, Deserialize)]
pub struct StatsQuery {
    pub range: Option<String>, // 7d, 30d, etc.
}

/// 详细统计数据
#[derive(Debug, Serialize)]
pub struct DetailedStats {
    pub overview: StatsOverview,
    pub usage: UsageStats,
    pub performance: PerformanceStats,
    pub costs: CostStats,
    pub charts: ChartData,
}

#[derive(Debug, Serialize)]
pub struct StatsOverview {
    pub total_requests: i64,
    pub success_rate: f64,
    pub avg_response_time: f64,
    pub total_cost: f64,
    pub active_accounts: i32,
    pub period: String,
}

#[derive(Debug, Serialize)]
pub struct UsageStats {
    pub requests_by_provider: HashMap<String, i64>,
    pub requests_by_model: HashMap<String, i64>,
    pub tokens_consumed: i64,
    pub daily_usage: Vec<DailyUsage>,
}

#[derive(Debug, Serialize)]
pub struct DailyUsage {
    pub date: String,
    pub requests: i64,
    pub tokens: i64,
}

#[derive(Debug, Serialize)]
pub struct PerformanceStats {
    pub avg_response_time: f64,
    pub p95_response_time: f64,
    pub p99_response_time: f64,
    pub error_rate: f64,
    pub response_time_trend: Vec<ResponseTimePoint>,
}

#[derive(Debug, Serialize)]
pub struct ResponseTimePoint {
    pub timestamp: String,
    pub avg_time: f64,
}

#[derive(Debug, Serialize)]
pub struct CostStats {
    pub total_cost: f64,
    pub cost_by_provider: HashMap<String, f64>,
    pub cost_by_model: HashMap<String, f64>,
    pub daily_costs: Vec<DailyCost>,
}

#[derive(Debug, Serialize)]
pub struct DailyCost {
    pub date: String,
    pub cost: f64,
}

#[derive(Debug, Serialize)]
pub struct ChartData {
    pub request_volume: Vec<ChartPoint>,
    pub response_times: Vec<ChartPoint>,
    pub error_rates: Vec<ChartPoint>,
    pub costs: Vec<ChartPoint>,
}

#[derive(Debug, Serialize)]
pub struct ChartPoint {
    pub timestamp: String,
    pub value: f64,
}

/// 获取详细统计数据
#[instrument(skip(database))]
pub async fn get_detailed_stats(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<StatsQuery>,
) -> AppResult<Json<DetailedStats>> {
    let range = params.range.unwrap_or_else(|| "7d".to_string());
    info!("📊 获取详细统计数据请求: 用户ID {}, 时间范围: {}", claims.sub, range);

    // 解析时间范围
    let days = match range.as_str() {
        "1d" => 1,
        "7d" => 7,
        "30d" => 30,
        "90d" => 90,
        _ => 7,
    };

    let user_id: i64 = claims.sub.parse().map_err(|_| crate::shared::AppError::Authentication(crate::infrastructure::AuthError::InvalidToken))?;

    // 获取用户的API Keys
    let api_keys = sqlx::query!(
        "SELECT id FROM api_keys WHERE user_id = $1 AND is_active = true",
        user_id
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let api_key_ids: Vec<i64> = api_keys.iter().map(|key| key.id).collect();

    if api_key_ids.is_empty() {
        info!("用户 {} 没有API Keys，返回空统计数据", user_id);
        return Ok(Json(create_empty_stats(range)));
    }

    // 基础统计查询
    let overview_result = sqlx::query!(
        r#"
        SELECT 
            COUNT(*) as total_requests,
            COUNT(CASE WHEN response_status >= 200 AND response_status < 300 THEN 1 END) as successful_requests,
            COALESCE(AVG(latency_ms), 0) as avg_response_time,
            COALESCE(SUM(cost_usd), 0) as total_cost,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cache_creation_tokens), 0) as total_cache_creation_tokens,
            COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(AVG(first_token_latency_ms), 0) as avg_first_token_latency,
            COALESCE(AVG(tokens_per_second), 0) as avg_tokens_per_second,
            COALESCE(AVG(cache_hit_rate), 0) as avg_cache_hit_rate
        FROM usage_records 
        WHERE api_key_id = ANY($1::bigint[])
        AND created_at >= NOW() - INTERVAL '1 day' * $2
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let total_requests = overview_result.total_requests.unwrap_or(0);
    let successful_requests = overview_result.successful_requests.unwrap_or(0);
    let success_rate = if total_requests > 0 {
        (successful_requests as f64 / total_requests as f64) * 100.0
    } else {
        0.0
    };

    // 按上游账号统计请求数
    let requests_by_provider = sqlx::query!(
        r#"
        SELECT 
            ua.provider,
            COUNT(*) as request_count
        FROM usage_records ur
        JOIN upstream_accounts ua ON ur.upstream_account_id = ua.id
        WHERE ur.api_key_id = ANY($1::bigint[])
        AND ur.created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY ua.provider
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let mut provider_stats = HashMap::new();
    for record in requests_by_provider {
        let provider_name = match record.provider.as_str() {
            "anthropic_api" | "anthropic_oauth" => "Anthropic",
            "claude_code" => "Claude Code",
            "gemini_cli" => "Gemini CLI",
            _ => &record.provider,
        };
        provider_stats.insert(provider_name.to_string(), record.request_count.unwrap_or(0));
    }

    // 按上游账号统计成本
    let cost_by_provider = sqlx::query!(
        r#"
        SELECT 
            ua.provider,
            COALESCE(SUM(ur.cost_usd), 0) as total_cost
        FROM usage_records ur
        JOIN upstream_accounts ua ON ur.upstream_account_id = ua.id
        WHERE ur.api_key_id = ANY($1::bigint[])
        AND ur.created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY ua.provider
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let mut provider_costs = HashMap::new();
    for record in cost_by_provider {
        let provider_name = match record.provider.as_str() {
            "anthropic_api" | "anthropic_oauth" => "Anthropic",
            "claude_code" => "Claude Code", 
            "gemini_cli" => "Gemini CLI",
            _ => &record.provider,
        };
        provider_costs.insert(provider_name.to_string(), record.total_cost.unwrap_or(0.0));
    }

    // 每日使用情况
    let daily_usage = sqlx::query!(
        r#"
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as requests,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(cache_creation_tokens), 0) as cache_creation_tokens,
            COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
            COALESCE(SUM(total_tokens), 0) as tokens,
            COALESCE(AVG(cache_hit_rate), 0) as avg_cache_hit_rate,
            COALESCE(AVG(tokens_per_second), 0) as avg_tokens_per_second
        FROM usage_records
        WHERE api_key_id = ANY($1::bigint[])
        AND created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY DATE(created_at)
        ORDER BY date
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let daily_usage_vec: Vec<DailyUsage> = daily_usage
        .into_iter()
        .map(|record| DailyUsage {
            date: record.date.map(|d| d.to_string()).unwrap_or_default(),
            requests: record.requests.unwrap_or(0),
            tokens: record.tokens.unwrap_or(0),
        })
        .collect();

    // 每日成本
    let daily_costs = sqlx::query!(
        r#"
        SELECT 
            DATE(created_at) as date,
            COALESCE(SUM(cost_usd), 0) as cost
        FROM usage_records
        WHERE api_key_id = ANY($1::bigint[])
        AND created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY DATE(created_at)
        ORDER BY date
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let daily_costs_vec: Vec<DailyCost> = daily_costs
        .into_iter()
        .map(|record| DailyCost {
            date: record.date.map(|d| d.to_string()).unwrap_or_default(),
            cost: record.cost.unwrap_or(0.0),
        })
        .collect();

    // 响应时间趋势
    let response_time_trend = sqlx::query!(
        r#"
        SELECT 
            DATE(created_at) as date,
            COALESCE(AVG(latency_ms), 0) as avg_time
        FROM usage_records
        WHERE api_key_id = ANY($1::bigint[])
        AND created_at >= NOW() - INTERVAL '1 day' * $2
        GROUP BY DATE(created_at)
        ORDER BY date
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let response_time_trend_vec: Vec<ResponseTimePoint> = response_time_trend
        .into_iter()
        .map(|record| ResponseTimePoint {
            timestamp: record.date.map(|d| format!("{}T00:00:00Z", d)).unwrap_or_default(),
            avg_time: bigdecimal_to_f64(record.avg_time),
        })
        .collect();

    // 获取活跃账号数量
    let active_accounts = sqlx::query!(
        "SELECT COUNT(*) as count FROM upstream_accounts WHERE user_id = $1 AND is_active = true",
        user_id
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    // 计算P95, P99响应时间
    let percentiles = sqlx::query!(
        r#"
        SELECT 
            COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) as p95,
            COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0) as p99
        FROM usage_records
        WHERE api_key_id = ANY($1::bigint[])
        AND created_at >= NOW() - INTERVAL '1 day' * $2
        "#,
        &api_key_ids,
        days as i32
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    // 构建图表数据
    let request_volume: Vec<ChartPoint> = daily_usage_vec
        .iter()
        .map(|item| ChartPoint {
            timestamp: format!("{}T00:00:00Z", item.date),
            value: item.requests as f64,
        })
        .collect();

    let response_times: Vec<ChartPoint> = response_time_trend_vec
        .iter()
        .map(|item| ChartPoint {
            timestamp: item.timestamp.clone(),
            value: item.avg_time,
        })
        .collect();

    let costs: Vec<ChartPoint> = daily_costs_vec
        .iter()
        .map(|item| ChartPoint {
            timestamp: format!("{}T00:00:00Z", item.date),
            value: item.cost,
        })
        .collect();

    // 计算错误率
    let error_rate = if total_requests > 0 {
        100.0 - success_rate
    } else {
        0.0
    };

    let error_rates: Vec<ChartPoint> = daily_usage_vec
        .iter()
        .map(|item| ChartPoint {
            timestamp: format!("{}T00:00:00Z", item.date),
            value: error_rate, // 简化版本，实际应该按天计算错误率
        })
        .collect();

    let stats = DetailedStats {
        overview: StatsOverview {
            total_requests,
            success_rate,
            avg_response_time: bigdecimal_to_f64(overview_result.avg_response_time.clone()),
            total_cost: overview_result.total_cost.unwrap_or(0.0),
            active_accounts: active_accounts.count.unwrap_or(0) as i32,
            period: range.clone(),
        },
        usage: UsageStats {
            requests_by_provider: provider_stats,
            requests_by_model: HashMap::new(), // TODO: 需要添加模型字段到usage_records表
            tokens_consumed: overview_result.total_tokens.unwrap_or(0),
            daily_usage: daily_usage_vec,
        },
        performance: PerformanceStats {
            avg_response_time: bigdecimal_to_f64(overview_result.avg_response_time.clone()),
            p95_response_time: percentiles.p95.unwrap_or(0.0),
            p99_response_time: percentiles.p99.unwrap_or(0.0),
            error_rate,
            response_time_trend: response_time_trend_vec,
        },
        costs: CostStats {
            total_cost: overview_result.total_cost.unwrap_or(0.0),
            cost_by_provider: provider_costs,
            cost_by_model: HashMap::new(), // TODO: 需要添加模型字段到usage_records表
            daily_costs: daily_costs_vec,
        },
        charts: ChartData {
            request_volume,
            response_times,
            error_rates,
            costs,
        },
    };

    info!("✅ 获取详细统计数据成功: {} 时间范围，总请求数: {}", range, total_requests);

    Ok(Json(stats))
}

/// 将BigDecimal转换为f64
fn bigdecimal_to_f64(value: Option<sqlx::types::BigDecimal>) -> f64 {
    value
        .map(|v| v.to_string().parse().unwrap_or(0.0))
        .unwrap_or(0.0)
}

/// 创建空的统计数据（用于没有数据时）
fn create_empty_stats(range: String) -> DetailedStats {
    DetailedStats {
        overview: StatsOverview {
            total_requests: 0,
            success_rate: 0.0,
            avg_response_time: 0.0,
            total_cost: 0.0,
            active_accounts: 0,
            period: range.clone(),
        },
        usage: UsageStats {
            requests_by_provider: HashMap::new(),
            requests_by_model: HashMap::new(),
            tokens_consumed: 0,
            daily_usage: Vec::new(),
        },
        performance: PerformanceStats {
            avg_response_time: 0.0,
            p95_response_time: 0.0,
            p99_response_time: 0.0,
            error_rate: 0.0,
            response_time_trend: Vec::new(),
        },
        costs: CostStats {
            total_cost: 0.0,
            cost_by_provider: HashMap::new(),
            cost_by_model: HashMap::new(),
            daily_costs: Vec::new(),
        },
        charts: ChartData {
            request_volume: Vec::new(),
            response_times: Vec::new(),
            error_rates: Vec::new(),
            costs: Vec::new(),
        },
    }
}

/// 获取基础统计数据
#[instrument(skip(database))]
pub async fn get_basic_stats(
    State(database): State<Database>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<StatsOverview>> {
    info!("📈 获取基础统计数据请求: 用户ID {}", claims.sub);

    let user_id: i64 = claims.sub.parse().map_err(|_| crate::shared::AppError::Authentication(crate::infrastructure::AuthError::InvalidToken))?;

    // 获取用户的API Keys
    let api_keys = sqlx::query!(
        "SELECT id FROM api_keys WHERE user_id = $1 AND is_active = true",
        user_id
    )
    .fetch_all(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let api_key_ids: Vec<i64> = api_keys.iter().map(|key| key.id).collect();

    if api_key_ids.is_empty() {
        info!("用户 {} 没有API Keys，返回空统计数据", user_id);
        return Ok(Json(StatsOverview {
            total_requests: 0,
            success_rate: 0.0,
            avg_response_time: 0.0,
            total_cost: 0.0,
            active_accounts: 0,
            period: "7d".to_string(),
        }));
    }

    // 基础统计查询（过去7天）
    let overview_result = sqlx::query!(
        r#"
        SELECT 
            COUNT(*) as total_requests,
            COUNT(CASE WHEN response_status >= 200 AND response_status < 300 THEN 1 END) as successful_requests,
            COALESCE(AVG(latency_ms), 0) as avg_response_time,
            COALESCE(SUM(cost_usd), 0) as total_cost
        FROM usage_records 
        WHERE api_key_id = ANY($1::bigint[])
        AND created_at >= NOW() - INTERVAL '7 days'
        "#,
        &api_key_ids
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let total_requests = overview_result.total_requests.unwrap_or(0);
    let successful_requests = overview_result.successful_requests.unwrap_or(0);
    let success_rate = if total_requests > 0 {
        (successful_requests as f64 / total_requests as f64) * 100.0
    } else {
        0.0
    };

    // 获取活跃账号数量
    let active_accounts = sqlx::query!(
        "SELECT COUNT(*) as count FROM upstream_accounts WHERE user_id = $1 AND is_active = true",
        user_id
    )
    .fetch_one(database.pool())
    .await
    .map_err(|e| crate::shared::AppError::Database(e))?;

    let stats = StatsOverview {
        total_requests,
        success_rate,
        avg_response_time: bigdecimal_to_f64(overview_result.avg_response_time),
        total_cost: overview_result.total_cost.unwrap_or(0.0),
        active_accounts: active_accounts.count.unwrap_or(0) as i32,
        period: "7d".to_string(),
    };

    info!("✅ 获取基础统计数据成功: 总请求数 {}", total_requests);

    Ok(Json(stats))
}