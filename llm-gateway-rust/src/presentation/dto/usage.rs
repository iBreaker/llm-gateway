//! 使用统计API数据传输对象
//! 
//! 新架构：详细的Token统计和性能指标

use serde::{Deserialize, Serialize};

/// 使用统计查询参数
#[derive(Debug, Deserialize)]
pub struct UsageStatsQuery {
    /// 开始日期 (YYYY-MM-DD)
    pub start_date: Option<String>,
    /// 结束日期 (YYYY-MM-DD)
    pub end_date: Option<String>,
    /// 服务提供商筛选
    pub service_provider: Option<String>,
    /// 模型名称筛选
    pub model_name: Option<String>,
    /// 分组方式: day, hour, provider, model
    pub group_by: Option<String>,
    /// 页码
    pub page: Option<i32>,
    /// 每页大小
    pub page_size: Option<i32>,
}

/// 使用统计响应
#[derive(Debug, Serialize)]
pub struct UsageStatsResponse {
    pub stats: Vec<UsageStatItem>,
    pub total_count: i64,
    pub summary: UsageSummary,
    pub pagination: PaginationInfo,
}

/// 单条使用统计记录
#[derive(Debug, Serialize)]
pub struct UsageStatItem {
    pub period: String,              // 时间周期或分组标识
    pub service_provider: String,    // 服务提供商
    pub model_name: Option<String>,  // 模型名称
    pub request_count: i64,          // 请求数量
    
    // Token 统计（详细分类）
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cache_creation_tokens: i64,
    pub cache_read_tokens: i64,
    pub total_tokens: i64,
    
    // 成本和性能
    pub total_cost_usd: f64,
    pub avg_latency_ms: f64,
    pub avg_first_token_latency_ms: Option<f64>,
    pub avg_tokens_per_second: Option<f64>,
    
    // 缓存和错误统计
    pub avg_cache_hit_rate: Option<f64>,
    pub error_count: i64,
    pub success_rate: f64,
    
    // 路由和重试统计
    pub avg_confidence_score: Option<f64>,
    pub total_retry_count: i64,
}

/// 使用统计汇总
#[derive(Debug, Serialize)]
pub struct UsageSummary {
    pub total_requests: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub avg_latency_ms: f64,
    pub overall_success_rate: f64,
    pub top_models: Vec<ModelUsage>,
    pub cost_breakdown: CostBreakdown,
}

/// 模型使用统计
#[derive(Debug, Serialize)]
pub struct ModelUsage {
    pub model_name: String,
    pub request_count: i64,
    pub total_tokens: i64,
    pub total_cost_usd: f64,
    pub percentage: f64,
}

/// 成本分解
#[derive(Debug, Serialize)]
pub struct CostBreakdown {
    pub by_provider: Vec<ProviderCost>,
    pub by_token_type: TokenTypeCost,
}

/// 按提供商的成本统计
#[derive(Debug, Serialize)]
pub struct ProviderCost {
    pub service_provider: String,
    pub cost_usd: f64,
    pub percentage: f64,
}

/// 按Token类型的成本统计
#[derive(Debug, Serialize)]
pub struct TokenTypeCost {
    pub input_cost_usd: f64,
    pub output_cost_usd: f64,
    pub cache_creation_cost_usd: f64,
    pub cache_read_cost_usd: f64,
}

/// 分页信息
#[derive(Debug, Serialize)]
pub struct PaginationInfo {
    pub current_page: i32,
    pub page_size: i32,
    pub total_pages: i32,
    pub has_next: bool,
    pub has_prev: bool,
}

/// 实时使用统计
#[derive(Debug, Serialize)]
pub struct RealtimeUsageStats {
    pub current_requests_per_minute: f64,
    pub current_tokens_per_minute: f64,
    pub current_cost_per_hour: f64,
    pub active_accounts: i32,
    pub healthy_accounts: i32,
    pub avg_response_time_ms: f64,
    pub cache_hit_rate: f64,
    pub last_updated: String,
}

/// 使用趋势数据
#[derive(Debug, Serialize)]
pub struct UsageTrendResponse {
    pub trends: Vec<TrendDataPoint>,
    pub comparison: Option<TrendComparison>,
}

/// 趋势数据点
#[derive(Debug, Serialize)]
pub struct TrendDataPoint {
    pub timestamp: String,
    pub requests: i64,
    pub tokens: i64,
    pub cost_usd: f64,
    pub avg_latency_ms: f64,
    pub error_rate: f64,
}

/// 趋势对比
#[derive(Debug, Serialize)]
pub struct TrendComparison {
    pub period: String,           // 对比周期: "1d", "7d", "30d"
    pub requests_change: f64,     // 变化百分比
    pub tokens_change: f64,
    pub cost_change: f64,
    pub latency_change: f64,
}

impl UsageStatsQuery {
    /// 验证查询参数
    pub fn validate(&self) -> Result<(), String> {
        // 验证日期格式
        if let Some(ref start_date) = self.start_date {
            if chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d").is_err() {
                return Err("开始日期格式无效，应为 YYYY-MM-DD".to_string());
            }
        }
        
        if let Some(ref end_date) = self.end_date {
            if chrono::NaiveDate::parse_from_str(end_date, "%Y-%m-%d").is_err() {
                return Err("结束日期格式无效，应为 YYYY-MM-DD".to_string());
            }
        }

        // 验证分组方式
        if let Some(ref group_by) = self.group_by {
            if !["day", "hour", "provider", "model"].contains(&group_by.as_str()) {
                return Err("分组方式必须是: day, hour, provider, model 之一".to_string());
            }
        }

        // 验证分页参数
        if let Some(page) = self.page {
            if page < 1 {
                return Err("页码必须大于 0".to_string());
            }
        }

        if let Some(page_size) = self.page_size {
            if page_size < 1 || page_size > 100 {
                return Err("每页大小必须在 1-100 之间".to_string());
            }
        }

        Ok(())
    }

    /// 获取默认分页参数
    pub fn page_params(&self) -> (i32, i32) {
        let page = self.page.unwrap_or(1);
        let page_size = self.page_size.unwrap_or(20);
        (page, page_size)
    }

    /// 计算分页偏移量
    pub fn offset(&self) -> i32 {
        let (page, page_size) = self.page_params();
        (page - 1) * page_size
    }
}

impl PaginationInfo {
    /// 创建分页信息
    pub fn new(current_page: i32, page_size: i32, total_count: i64) -> Self {
        let total_pages = ((total_count as f64) / (page_size as f64)).ceil() as i32;
        
        Self {
            current_page,
            page_size,
            total_pages,
            has_next: current_page < total_pages,
            has_prev: current_page > 1,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_usage_stats_query_validation() {
        let query = UsageStatsQuery {
            start_date: Some("2025-01-01".to_string()),
            end_date: Some("2025-01-31".to_string()),
            service_provider: Some("anthropic".to_string()),
            model_name: None,
            group_by: Some("day".to_string()),
            page: Some(1),
            page_size: Some(20),
        };

        assert!(query.validate().is_ok());
    }

    #[test]
    fn test_usage_stats_query_invalid_date() {
        let query = UsageStatsQuery {
            start_date: Some("invalid-date".to_string()),
            end_date: None,
            service_provider: None,
            model_name: None,
            group_by: None,
            page: None,
            page_size: None,
        };

        assert!(query.validate().is_err());
        assert!(query.validate().unwrap_err().contains("日期格式无效"));
    }

    #[test]
    fn test_usage_stats_query_invalid_group_by() {
        let query = UsageStatsQuery {
            start_date: None,
            end_date: None,
            service_provider: None,
            model_name: None,
            group_by: Some("invalid".to_string()),
            page: None,
            page_size: None,
        };

        assert!(query.validate().is_err());
        assert!(query.validate().unwrap_err().contains("分组方式必须是"));
    }

    #[test]
    fn test_pagination_info() {
        let pagination = PaginationInfo::new(2, 10, 25);
        
        assert_eq!(pagination.current_page, 2);
        assert_eq!(pagination.page_size, 10);
        assert_eq!(pagination.total_pages, 3);
        assert_eq!(pagination.has_prev, true);
        assert_eq!(pagination.has_next, true);
    }

    #[test]
    fn test_query_offset_calculation() {
        let query = UsageStatsQuery {
            start_date: None,
            end_date: None,
            service_provider: None,
            model_name: None,
            group_by: None,
            page: Some(3),
            page_size: Some(10),
        };

        assert_eq!(query.offset(), 20); // (3-1) * 10
    }
}