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
#[instrument(skip(_database))]
pub async fn get_detailed_stats(
    State(_database): State<Database>,
    Extension(claims): Extension<Claims>,
    Query(params): Query<StatsQuery>,
) -> AppResult<Json<DetailedStats>> {
    let range = params.range.unwrap_or_else(|| "7d".to_string());
    info!("📊 获取详细统计数据请求: 用户ID {}, 时间范围: {}", claims.sub, range);

    // 模拟统计数据
    let mut requests_by_provider = HashMap::new();
    requests_by_provider.insert("Anthropic".to_string(), 1250);
    requests_by_provider.insert("Google".to_string(), 850);
    requests_by_provider.insert("OpenAI".to_string(), 620);

    let mut requests_by_model = HashMap::new();
    requests_by_model.insert("claude-3-sonnet".to_string(), 980);
    requests_by_model.insert("gemini-pro".to_string(), 750);
    requests_by_model.insert("gpt-4".to_string(), 520);
    requests_by_model.insert("claude-3-haiku".to_string(), 470);

    let mut cost_by_provider = HashMap::new();
    cost_by_provider.insert("Anthropic".to_string(), 125.50);
    cost_by_provider.insert("Google".to_string(), 68.30);
    cost_by_provider.insert("OpenAI".to_string(), 89.20);

    let mut cost_by_model = HashMap::new();
    cost_by_model.insert("claude-3-sonnet".to_string(), 98.40);
    cost_by_model.insert("gemini-pro".to_string(), 45.60);
    cost_by_model.insert("gpt-4".to_string(), 89.20);
    cost_by_model.insert("claude-3-haiku".to_string(), 27.10);

    let daily_usage = vec![
        DailyUsage { date: "2025-08-01".to_string(), requests: 320, tokens: 45000 },
        DailyUsage { date: "2025-08-02".to_string(), requests: 410, tokens: 58000 },
        DailyUsage { date: "2025-08-03".to_string(), requests: 380, tokens: 52000 },
        DailyUsage { date: "2025-08-04".to_string(), requests: 450, tokens: 61000 },
        DailyUsage { date: "2025-08-05".to_string(), requests: 520, tokens: 68000 },
    ];

    let daily_costs = vec![
        DailyCost { date: "2025-08-01".to_string(), cost: 45.20 },
        DailyCost { date: "2025-08-02".to_string(), cost: 58.90 },
        DailyCost { date: "2025-08-03".to_string(), cost: 52.40 },
        DailyCost { date: "2025-08-04".to_string(), cost: 61.80 },
        DailyCost { date: "2025-08-05".to_string(), cost: 64.70 },
    ];

    let response_time_trend = vec![
        ResponseTimePoint { timestamp: "2025-08-01T00:00:00Z".to_string(), avg_time: 234.5 },
        ResponseTimePoint { timestamp: "2025-08-02T00:00:00Z".to_string(), avg_time: 218.3 },
        ResponseTimePoint { timestamp: "2025-08-03T00:00:00Z".to_string(), avg_time: 245.7 },
        ResponseTimePoint { timestamp: "2025-08-04T00:00:00Z".to_string(), avg_time: 201.2 },
        ResponseTimePoint { timestamp: "2025-08-05T00:00:00Z".to_string(), avg_time: 189.4 },
    ];

    let request_volume = vec![
        ChartPoint { timestamp: "2025-08-01T00:00:00Z".to_string(), value: 320.0 },
        ChartPoint { timestamp: "2025-08-02T00:00:00Z".to_string(), value: 410.0 },
        ChartPoint { timestamp: "2025-08-03T00:00:00Z".to_string(), value: 380.0 },
        ChartPoint { timestamp: "2025-08-04T00:00:00Z".to_string(), value: 450.0 },
        ChartPoint { timestamp: "2025-08-05T00:00:00Z".to_string(), value: 520.0 },
    ];

    let response_times = vec![
        ChartPoint { timestamp: "2025-08-01T00:00:00Z".to_string(), value: 234.5 },
        ChartPoint { timestamp: "2025-08-02T00:00:00Z".to_string(), value: 218.3 },
        ChartPoint { timestamp: "2025-08-03T00:00:00Z".to_string(), value: 245.7 },
        ChartPoint { timestamp: "2025-08-04T00:00:00Z".to_string(), value: 201.2 },
        ChartPoint { timestamp: "2025-08-05T00:00:00Z".to_string(), value: 189.4 },
    ];

    let error_rates = vec![
        ChartPoint { timestamp: "2025-08-01T00:00:00Z".to_string(), value: 1.2 },
        ChartPoint { timestamp: "2025-08-02T00:00:00Z".to_string(), value: 0.8 },
        ChartPoint { timestamp: "2025-08-03T00:00:00Z".to_string(), value: 1.5 },
        ChartPoint { timestamp: "2025-08-04T00:00:00Z".to_string(), value: 0.6 },
        ChartPoint { timestamp: "2025-08-05T00:00:00Z".to_string(), value: 0.9 },
    ];

    let costs = vec![
        ChartPoint { timestamp: "2025-08-01T00:00:00Z".to_string(), value: 45.20 },
        ChartPoint { timestamp: "2025-08-02T00:00:00Z".to_string(), value: 58.90 },
        ChartPoint { timestamp: "2025-08-03T00:00:00Z".to_string(), value: 52.40 },
        ChartPoint { timestamp: "2025-08-04T00:00:00Z".to_string(), value: 61.80 },
        ChartPoint { timestamp: "2025-08-05T00:00:00Z".to_string(), value: 64.70 },
    ];

    let stats = DetailedStats {
        overview: StatsOverview {
            total_requests: 2720,
            success_rate: 98.7,
            avg_response_time: 217.8,
            total_cost: 283.00,
            active_accounts: 5,
            period: range.clone(),
        },
        usage: UsageStats {
            requests_by_provider,
            requests_by_model,
            tokens_consumed: 284000,
            daily_usage,
        },
        performance: PerformanceStats {
            avg_response_time: 217.8,
            p95_response_time: 456.2,
            p99_response_time: 789.1,
            error_rate: 1.3,
            response_time_trend,
        },
        costs: CostStats {
            total_cost: 283.00,
            cost_by_provider,
            cost_by_model,
            daily_costs,
        },
        charts: ChartData {
            request_volume,
            response_times,
            error_rates,
            costs,
        },
    };

    info!("✅ 获取详细统计数据成功: {} 时间范围", range);

    Ok(Json(stats))
}

/// 获取基础统计数据
#[instrument(skip(_database))]
pub async fn get_basic_stats(
    State(_database): State<Database>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<StatsOverview>> {
    info!("📈 获取基础统计数据请求: 用户ID {}", claims.sub);

    let stats = StatsOverview {
        total_requests: 2720,
        success_rate: 98.7,
        avg_response_time: 217.8,
        total_cost: 283.00,
        active_accounts: 5,
        period: "7d".to_string(),
    };

    info!("✅ 获取基础统计数据成功");

    Ok(Json(stats))
}