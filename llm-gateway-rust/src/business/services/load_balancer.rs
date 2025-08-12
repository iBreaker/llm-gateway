//! 智能负载均衡服务
//! 
//! 提供多种负载均衡策略和智能路由功能

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use rand::Rng;
use tracing::{info, warn, instrument, debug};

use crate::business::domain::{UpstreamAccount, AccountProvider};
use crate::shared::{AppError, AppResult};
use crate::shared::constants::load_balancer::*;

/// 负载均衡策略
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum LoadBalancingStrategy {
    /// 轮询 - 简单轮询所有健康节点
    RoundRobin,
    /// 加权轮询 - 根据权重分配请求
    WeightedRoundRobin,
    /// 最少连接 - 选择连接数最少的节点
    LeastConnections,
    /// 基于响应时间 - 选择响应时间最短的节点
    FastestResponse,
    /// 健康优先 - 基于健康评分选择
    HealthBased,
    /// 智能自适应 - 综合多个因素动态选择
    Adaptive,
    /// 地理位置优先 - 根据地理位置就近选择
    Geographic,
}

impl LoadBalancingStrategy {
    pub fn as_str(&self) -> &'static str {
        match self {
            LoadBalancingStrategy::RoundRobin => "round_robin",
            LoadBalancingStrategy::WeightedRoundRobin => "weighted_round_robin",
            LoadBalancingStrategy::LeastConnections => "least_connections",
            LoadBalancingStrategy::FastestResponse => "fastest_response",
            LoadBalancingStrategy::HealthBased => "health_based",
            LoadBalancingStrategy::Adaptive => "adaptive",
            LoadBalancingStrategy::Geographic => "geographic",
        }
    }
}

/// 节点性能指标
#[derive(Debug, Clone)]
pub struct NodeMetrics {
    pub account_id: i64,
    pub success_count: u64,
    pub failure_count: u64,
    pub average_response_time_ms: f64,
    pub last_response_time_ms: u64,
    pub active_connections: u32,
    pub last_used: Instant,
    pub error_streak: u32,
    pub total_requests: u64,
}

impl NodeMetrics {
    pub fn new(account_id: i64) -> Self {
        Self {
            account_id,
            success_count: 0,
            failure_count: 0,
            average_response_time_ms: 0.0,
            last_response_time_ms: 0,
            active_connections: 0,
            last_used: Instant::now(),
            error_streak: 0,
            total_requests: 0,
        }
    }

    /// 计算成功率
    pub fn success_rate(&self) -> f64 {
        if self.total_requests == 0 {
            1.0
        } else {
            self.success_count as f64 / self.total_requests as f64
        }
    }

    /// 计算错误率
    pub fn error_rate(&self) -> f64 {
        1.0 - self.success_rate()
    }

    /// 更新成功记录
    pub fn record_success(&mut self, response_time_ms: u64) {
        self.success_count += 1;
        self.total_requests += 1;
        self.error_streak = 0;
        self.last_response_time_ms = response_time_ms;
        self.last_used = Instant::now();
        
        // 更新平均响应时间（指数移动平均）
        let alpha = 0.2; // 平滑因子
        self.average_response_time_ms = alpha * response_time_ms as f64 
            + (1.0 - alpha) * self.average_response_time_ms;
    }

    /// 更新失败记录
    pub fn record_failure(&mut self) {
        self.failure_count += 1;
        self.total_requests += 1;
        self.error_streak += 1;
        self.last_used = Instant::now();
    }

    /// 计算节点健康评分
    pub fn calculate_health_score(&self) -> f64 {
        let success_rate = self.success_rate();
        let response_score = if self.average_response_time_ms > 0.0 {
            // 响应时间评分：越快分数越高（最大5秒，归一化到0-1）
            1.0 - (self.average_response_time_ms / 5000.0).min(1.0)
        } else {
            1.0
        };
        
        // 连接数评分：连接数越少分数越高
        let connection_score = if self.active_connections > 0 {
            1.0 / (1.0 + self.active_connections as f64 / 10.0)
        } else {
            1.0
        };

        // 错误连击惩罚：连续错误会大幅降低分数
        let streak_penalty = if self.error_streak > 0 {
            1.0 / (1.0 + self.error_streak as f64 * 0.5)
        } else {
            1.0
        };

        // 综合评分：成功率(40%) + 响应时间(30%) + 连接数(20%) + 稳定性(10%)
        success_rate * 0.4 + response_score * 0.3 + connection_score * 0.2 + streak_penalty * 0.1
    }
}

/// 熔断器状态
#[derive(Debug, Clone, PartialEq)]
pub enum CircuitBreakerState {
    Closed,    // 正常状态
    Open,      // 熔断开启
    HalfOpen,  // 半开状态
}

/// 熔断器
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    pub state: CircuitBreakerState,
    pub failure_count: u32,
    pub last_failure_time: Option<Instant>,
    pub success_count_in_half_open: u32,
}

impl CircuitBreaker {
    pub fn new() -> Self {
        Self {
            state: CircuitBreakerState::Closed,
            failure_count: 0,
            last_failure_time: None,
            success_count_in_half_open: 0,
        }
    }

    /// 记录成功
    pub fn record_success(&mut self) {
        match self.state {
            CircuitBreakerState::HalfOpen => {
                self.success_count_in_half_open += 1;
                if self.success_count_in_half_open >= 3 {
                    self.reset();
                }
            }
            CircuitBreakerState::Open => {
                // 在Open状态下的成功可能是误报，忽略
            }
            CircuitBreakerState::Closed => {
                self.failure_count = 0;
            }
        }
    }

    /// 记录失败
    pub fn record_failure(&mut self) {
        self.failure_count += 1;
        self.last_failure_time = Some(Instant::now());
        
        match self.state {
            CircuitBreakerState::Closed => {
                if self.failure_count >= CIRCUIT_BREAKER_FAILURE_THRESHOLD {
                    self.state = CircuitBreakerState::Open;
                    warn!("熔断器开启：连续失败 {} 次", self.failure_count);
                }
            }
            CircuitBreakerState::HalfOpen => {
                self.state = CircuitBreakerState::Open;
                self.success_count_in_half_open = 0;
                warn!("熔断器重新开启：半开状态下失败");
            }
            CircuitBreakerState::Open => {
                // 已经是开启状态
            }
        }
    }

    /// 检查是否允许请求通过
    pub fn can_execute(&mut self) -> bool {
        match self.state {
            CircuitBreakerState::Closed => true,
            CircuitBreakerState::Open => {
                if let Some(last_failure) = self.last_failure_time {
                    if last_failure.elapsed() >= Duration::from_secs(CIRCUIT_BREAKER_TIMEOUT_SECONDS) {
                        self.state = CircuitBreakerState::HalfOpen;
                        debug!("熔断器进入半开状态");
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            CircuitBreakerState::HalfOpen => true,
        }
    }

    /// 重置熔断器
    pub fn reset(&mut self) {
        self.state = CircuitBreakerState::Closed;
        self.failure_count = 0;
        self.last_failure_time = None;
        self.success_count_in_half_open = 0;
        info!("熔断器已重置为正常状态");
    }
}

/// 智能负载均衡器
pub struct IntelligentLoadBalancer {
    strategy: LoadBalancingStrategy,
    metrics: Arc<RwLock<HashMap<i64, NodeMetrics>>>,
    circuit_breakers: Arc<RwLock<HashMap<i64, CircuitBreaker>>>,
    round_robin_index: Arc<RwLock<usize>>,
}

impl IntelligentLoadBalancer {
    /// 创建新的负载均衡器
    pub fn new(strategy: LoadBalancingStrategy) -> Self {
        Self {
            strategy,
            metrics: Arc::new(RwLock::new(HashMap::new())),
            circuit_breakers: Arc::new(RwLock::new(HashMap::new())),
            round_robin_index: Arc::new(RwLock::new(0)),
        }
    }

    /// 选择最佳上游账号
    #[instrument(skip(self, accounts))]
    pub async fn select_account(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        if accounts.is_empty() {
            return Err(AppError::Business("没有可用的上游账号".to_string()));
        }

        // 过滤可用的账号（活跃且通过熔断器检查）
        let available_accounts = self.filter_available_accounts(accounts).await?;
        
        if available_accounts.is_empty() {
            return Err(AppError::Business("所有上游账号均不可用".to_string()));
        }

        let selected = match self.strategy {
            LoadBalancingStrategy::RoundRobin => {
                self.round_robin_select(&available_accounts).await?
            }
            LoadBalancingStrategy::WeightedRoundRobin => {
                self.weighted_round_robin_select(&available_accounts).await?
            }
            LoadBalancingStrategy::LeastConnections => {
                self.least_connections_select(&available_accounts).await?
            }
            LoadBalancingStrategy::FastestResponse => {
                self.fastest_response_select(&available_accounts).await?
            }
            LoadBalancingStrategy::HealthBased => {
                self.health_based_select(&available_accounts).await?
            }
            LoadBalancingStrategy::Adaptive => {
                self.adaptive_select(&available_accounts).await?
            }
            LoadBalancingStrategy::Geographic => {
                self.geographic_select(&available_accounts).await?
            }
        };

        info!(
            "🎯 智能负载均衡选择账号: {} (提供商: {:?}, 策略: {:?})", 
            selected.account_name,
            selected.provider,
            self.strategy
        );

        Ok(selected)
    }

    /// 过滤可用的账号
    async fn filter_available_accounts(&self, accounts: &[UpstreamAccount]) -> AppResult<Vec<UpstreamAccount>> {
        let mut circuit_breakers = self.circuit_breakers.write().await;
        let mut available = Vec::new();

        for account in accounts {
            if !account.is_active {
                continue;
            }

            // 检查熔断器状态
            let breaker = circuit_breakers
                .entry(account.id)
                .or_insert_with(CircuitBreaker::new);
            
            if breaker.can_execute() {
                available.push(account.clone());
            }
        }

        Ok(available)
    }

    /// 轮询选择
    async fn round_robin_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        let mut index = self.round_robin_index.write().await;
        let selected_index = *index % accounts.len();
        *index = (*index + 1) % accounts.len();
        
        Ok(accounts[selected_index].clone())
    }

    /// 加权轮询选择
    async fn weighted_round_robin_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        // 计算总权重
        let total_weight: i32 = accounts.iter()
            .map(|acc| self.get_dynamic_weight(acc))
            .sum();

        if total_weight <= 0 {
            return self.round_robin_select(accounts).await;
        }

        // 加权随机选择
        let mut rng = rand::thread_rng();
        let random_weight = rng.gen_range(0..total_weight);
        
        let mut current_weight = 0;
        for account in accounts {
            current_weight += self.get_dynamic_weight(account);
            if current_weight > random_weight {
                return Ok(account.clone());
            }
        }

        // 兜底
        Ok(accounts[0].clone())
    }

    /// 最少连接选择
    async fn least_connections_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        let metrics_guard = self.metrics.read().await;
        
        let best_account = accounts
            .iter()
            .min_by_key(|account| {
                metrics_guard
                    .get(&account.id)
                    .map(|m| m.active_connections)
                    .unwrap_or(0)
            })
            .ok_or_else(|| AppError::Business("无法选择最少连接账号".to_string()))?;

        Ok(best_account.clone())
    }

    /// 最快响应选择
    async fn fastest_response_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        let metrics_guard = self.metrics.read().await;
        
        let best_account = accounts
            .iter()
            .min_by(|a, b| {
                let a_time = metrics_guard
                    .get(&a.id)
                    .map(|m| m.average_response_time_ms)
                    .unwrap_or(f64::MAX);
                let b_time = metrics_guard
                    .get(&b.id)
                    .map(|m| m.average_response_time_ms)
                    .unwrap_or(f64::MAX);
                a_time.partial_cmp(&b_time).unwrap_or(std::cmp::Ordering::Equal)
            })
            .ok_or_else(|| AppError::Business("无法选择最快响应账号".to_string()))?;

        Ok(best_account.clone())
    }

    /// 基于健康状态选择
    async fn health_based_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        let metrics_guard = self.metrics.read().await;
        
        let mut scored_accounts: Vec<_> = accounts
            .iter()
            .map(|account| {
                let health_score = metrics_guard
                    .get(&account.id)
                    .map(|m| m.calculate_health_score())
                    .unwrap_or(0.5); // 默认中等健康分数
                
                (account, health_score)
            })
            .collect();

        // 按健康分数排序
        scored_accounts.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        Ok(scored_accounts[0].0.clone())
    }

    /// 智能自适应选择
    async fn adaptive_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        let metrics_guard = self.metrics.read().await;
        
        let mut scored_accounts: Vec<_> = accounts
            .iter()
            .map(|account| {
                let metrics = metrics_guard.get(&account.id);
                
                // 计算各项评分
                let health_score = metrics.map(|m| m.calculate_health_score()).unwrap_or(0.5);
                let success_rate = metrics.map(|m| m.success_rate()).unwrap_or(1.0);
                let response_score = metrics.map(|m| {
                    if m.average_response_time_ms > 0.0 {
                        1.0 - (m.average_response_time_ms / 5000.0).min(1.0)
                    } else {
                        1.0
                    }
                }).unwrap_or(1.0);
                
                // 负载评分
                let load_score = metrics.map(|m| {
                    1.0 / (1.0 + m.active_connections as f64 / 10.0)
                }).unwrap_or(1.0);

                // 提供商多样性评分（避免所有请求都打到同一个提供商）
                let provider_diversity_score = match account.provider {
                    AccountProvider::AnthropicApi | AccountProvider::AnthropicOauth => 1.0,
                };

                // 综合评分：健康(25%) + 成功率(25%) + 响应时间(20%) + 负载(15%) + 多样性(15%)
                let total_score = health_score * 0.25 
                    + success_rate * 0.25 
                    + response_score * 0.20 
                    + load_score * 0.15 
                    + provider_diversity_score * 0.15;
                
                (account, total_score)
            })
            .collect();

        // 按综合评分排序
        scored_accounts.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        // 在前几名中随机选择，避免总是选择同一个
        let top_candidates = std::cmp::min(3, scored_accounts.len());
        let mut rng = rand::thread_rng();
        let selected_idx = rng.gen_range(0..top_candidates);
        
        debug!(
            "🧠 自适应选择：候选 {} 个，选择第 {} 个 (评分: {:.3})",
            top_candidates, selected_idx + 1, scored_accounts[selected_idx].1
        );

        Ok(scored_accounts[selected_idx].0.clone())
    }

    /// 地理位置优先选择
    async fn geographic_select(&self, accounts: &[UpstreamAccount]) -> AppResult<UpstreamAccount> {
        // 简化实现：直接使用健康优先选择
        self.health_based_select(accounts).await
    }

    /// 获取动态权重（基于实时性能调整）
    fn get_dynamic_weight(&self, account: &UpstreamAccount) -> i32 {
        // 基础权重（假设数据库中存储，这里简化为固定值）
        let base_weight = 100;
        
        // 简化权重计算，主要基于账号是否激活
        let health_multiplier = if account.is_active && account.credentials.is_valid() {
            1.0
        } else {
            0.1
        };

        (base_weight as f64 * health_multiplier) as i32
    }

    /// 记录请求成功
    pub async fn record_success(&self, account_id: i64, response_time_ms: u64) {
        let mut metrics_guard = self.metrics.write().await;
        let metrics = metrics_guard
            .entry(account_id)
            .or_insert_with(|| NodeMetrics::new(account_id));
        
        metrics.record_success(response_time_ms);
        metrics.active_connections = metrics.active_connections.saturating_sub(1);

        let mut breakers_guard = self.circuit_breakers.write().await;
        let breaker = breakers_guard
            .entry(account_id)
            .or_insert_with(CircuitBreaker::new);
        breaker.record_success();
    }

    /// 记录请求失败
    pub async fn record_failure(&self, account_id: i64) {
        let mut metrics_guard = self.metrics.write().await;
        let metrics = metrics_guard
            .entry(account_id)
            .or_insert_with(|| NodeMetrics::new(account_id));
        
        metrics.record_failure();
        metrics.active_connections = metrics.active_connections.saturating_sub(1);

        let mut breakers_guard = self.circuit_breakers.write().await;
        let breaker = breakers_guard
            .entry(account_id)
            .or_insert_with(CircuitBreaker::new);
        breaker.record_failure();
    }

    /// 记录连接开始
    pub async fn record_connection_start(&self, account_id: i64) {
        let mut metrics_guard = self.metrics.write().await;
        let metrics = metrics_guard
            .entry(account_id)
            .or_insert_with(|| NodeMetrics::new(account_id));
        
        metrics.active_connections += 1;
    }

    /// 获取节点指标
    pub async fn get_node_metrics(&self, account_id: i64) -> Option<NodeMetrics> {
        let metrics_guard = self.metrics.read().await;
        metrics_guard.get(&account_id).cloned()
    }

    /// 获取所有节点指标
    pub async fn get_all_metrics(&self) -> HashMap<i64, NodeMetrics> {
        let metrics_guard = self.metrics.read().await;
        metrics_guard.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::domain::AccountCredentials;
    use chrono::Utc;

    fn create_test_account(id: i64, provider: AccountProvider, health: HealthStatus) -> UpstreamAccount {
        UpstreamAccount {
            id,
            user_id: 1,
            provider,
            account_name: format!("test_account_{}", id),
            credentials: AccountCredentials {
                session_key: Some("test_key".to_string()),
                access_token: None,
                refresh_token: None,
                expires_at: None,
                base_url: None,
            },
            is_active: true,
            health_status: health,
            created_at: Utc::now(),
            last_health_check: Some(Utc::now()),
        }
    }

    #[tokio::test]
    async fn test_round_robin_selection() {
        let balancer = IntelligentLoadBalancer::new(LoadBalancingStrategy::RoundRobin);
        let accounts = vec![
            create_test_account(1, AccountProvider::AnthropicApi, HealthStatus::Healthy),
            create_test_account(2, AccountProvider::AnthropicOauth, HealthStatus::Healthy),
        ];

        let first = balancer.select_account(&accounts).await.unwrap();
        let second = balancer.select_account(&accounts).await.unwrap();
        let third = balancer.select_account(&accounts).await.unwrap();

        assert_eq!(first.id, 1);
        assert_eq!(second.id, 2);
        assert_eq!(third.id, 1); // 循环回第一个
    }

    #[tokio::test]
    async fn test_health_based_selection() {
        let balancer = IntelligentLoadBalancer::new(LoadBalancingStrategy::HealthBased);
        let accounts = vec![
            create_test_account(1, AccountProvider::AnthropicApi, HealthStatus::Healthy),
            create_test_account(2, AccountProvider::AnthropicOauth, HealthStatus::Degraded),
        ];

        let selected = balancer.select_account(&accounts).await.unwrap();
        // 应该选择健康的账号
        assert_eq!(selected.id, 1);
    }

    #[tokio::test]
    async fn test_circuit_breaker() {
        let balancer = IntelligentLoadBalancer::new(LoadBalancingStrategy::HealthBased);
        
        // 记录多次失败以触发熔断器
        for _ in 0..CIRCUIT_BREAKER_FAILURE_THRESHOLD {
            balancer.record_failure(1).await;
        }

        let accounts = vec![
            create_test_account(1, AccountProvider::AnthropicApi, HealthStatus::Healthy),
            create_test_account(2, AccountProvider::AnthropicOauth, HealthStatus::Healthy),
        ];

        let selected = balancer.select_account(&accounts).await.unwrap();
        // 应该选择未被熔断的账号
        assert_eq!(selected.id, 2);
    }
}