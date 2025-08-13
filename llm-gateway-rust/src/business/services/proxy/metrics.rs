//! 代理统计收集模块

use std::collections::HashMap;
use tokio::sync::RwLock;
use std::sync::Arc;

use crate::business::services::{LoadBalancingStrategy, RoutingDecision};
use super::traits::TokenUsage;

/// 代理统计信息
#[derive(Debug, Clone)]
pub struct ProxyStats {
    pub total_requests: u64,
    pub successful_requests: u64,
    pub failed_requests: u64,
    pub average_latency_ms: f64,
    pub total_tokens: u64,
    pub total_cost_usd: f64,
    pub requests_by_provider: HashMap<String, u64>,
    pub requests_by_strategy: HashMap<LoadBalancingStrategy, u64>,
}

impl Default for ProxyStats {
    fn default() -> Self {
        Self {
            total_requests: 0,
            successful_requests: 0,
            failed_requests: 0,
            average_latency_ms: 0.0,
            total_tokens: 0,
            total_cost_usd: 0.0,
            requests_by_provider: HashMap::new(),
            requests_by_strategy: HashMap::new(),
        }
    }
}

/// 代理统计收集器
pub struct ProxyMetrics {
    stats: Arc<RwLock<ProxyStats>>,
}

impl ProxyMetrics {
    /// 创建新的统计收集器
    pub fn new() -> Self {
        Self {
            stats: Arc::new(RwLock::new(ProxyStats::default())),
        }
    }

    /// 更新统计信息
    pub async fn update_stats(
        &self,
        success: bool,
        latency_ms: u64,
        token_usage: &TokenUsage,
        cost_usd: f64,
        routing_decision: &RoutingDecision,
    ) {
        let mut stats = self.stats.write().await;

        stats.total_requests += 1;
        if success {
            stats.successful_requests += 1;
        } else {
            stats.failed_requests += 1;
        }

        // 更新平均延迟（移动平均）
        let alpha = 0.1;
        stats.average_latency_ms = alpha * latency_ms as f64 + (1.0 - alpha) * stats.average_latency_ms;

        stats.total_tokens += token_usage.total_tokens as u64;
        stats.total_cost_usd += cost_usd;

        // 按提供商统计
        let provider_key = format!("{:?}", routing_decision.selected_account.provider_config);
        *stats.requests_by_provider.entry(provider_key).or_insert(0) += 1;

        // 按策略统计
        *stats.requests_by_strategy.entry(routing_decision.strategy_used.clone()).or_insert(0) += 1;
    }

    /// 获取统计信息
    pub async fn get_stats(&self) -> ProxyStats {
        let stats = self.stats.read().await;
        stats.clone()
    }

    /// 重置统计信息
    pub async fn reset_stats(&self) {
        let mut stats = self.stats.write().await;
        *stats = ProxyStats::default();
    }
}

impl Default for ProxyMetrics {
    fn default() -> Self {
        Self::new()
    }
}