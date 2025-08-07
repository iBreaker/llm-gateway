//! 智能路由服务
//! 
//! 提供基于请求特征、用户偏好和实时性能的智能路由决策

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, instrument};

use crate::business::domain::{UpstreamAccount, AccountProvider, User};
use crate::business::services::load_balancer::{IntelligentLoadBalancer, LoadBalancingStrategy};
use crate::shared::{AppError, AppResult};

/// 请求特征
#[derive(Debug, Clone)]
pub struct RequestFeatures {
    /// 请求模型类型
    pub model: String,
    /// 请求大小（token数）
    pub estimated_tokens: u32,
    /// 请求优先级
    pub priority: RequestPriority,
    /// 用户地理位置
    pub user_region: Option<String>,
    /// 请求类型
    pub request_type: RequestType,
    /// 是否需要流式响应
    pub streaming: bool,
}

/// 请求优先级
#[derive(Debug, Clone, PartialEq)]
pub enum RequestPriority {
    Low,
    Normal,
    High,
    Critical,
}

/// 请求类型
#[derive(Debug, Clone, PartialEq)]
pub enum RequestType {
    /// 聊天对话
    Chat,
    /// 代码生成
    CodeGeneration,
    /// 文本总结
    Summarization,
    /// 翻译
    Translation,
    /// 分析任务
    Analysis,
    /// 创意写作
    CreativeWriting,
}

/// 用户偏好设置
#[derive(Debug, Clone)]
pub struct UserPreferences {
    pub user_id: i64,
    /// 偏好的提供商
    pub preferred_providers: Vec<AccountProvider>,
    /// 最大可接受延迟（毫秒）
    pub max_acceptable_latency_ms: u64,
    /// 成本敏感度 (0.0-1.0)
    pub cost_sensitivity: f64,
    /// 质量偏好 (0.0-1.0)
    pub quality_preference: f64,
    /// 是否启用智能路由
    pub smart_routing_enabled: bool,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            user_id: 0,
            preferred_providers: vec![AccountProvider::AnthropicApi, AccountProvider::AnthropicOauth],
            max_acceptable_latency_ms: 10000, // 10秒
            cost_sensitivity: 0.5,
            quality_preference: 0.8,
            smart_routing_enabled: true,
        }
    }
}

/// 路由决策结果
#[derive(Debug, Clone)]
pub struct RoutingDecision {
    pub selected_account: UpstreamAccount,
    pub strategy_used: LoadBalancingStrategy,
    pub confidence_score: f64,
    pub reasoning: String,
}

/// 智能路由器
pub struct SmartRouter {
    load_balancers: HashMap<LoadBalancingStrategy, Arc<IntelligentLoadBalancer>>,
    user_preferences: Arc<RwLock<HashMap<i64, UserPreferences>>>,
    provider_capabilities: HashMap<AccountProvider, ProviderCapabilities>,
}

/// 提供商能力特征
#[derive(Debug, Clone)]
pub struct ProviderCapabilities {
    pub provider: AccountProvider,
    /// 支持的模型列表
    pub supported_models: Vec<String>,
    /// 最大token数
    pub max_tokens: u32,
    /// 平均成本（每1k token的美元）
    pub cost_per_1k_tokens: f64,
    /// 质量评分 (0.0-1.0)
    pub quality_score: f64,
    /// 特殊能力
    pub specialties: Vec<RequestType>,
    /// 是否支持流式响应
    pub supports_streaming: bool,
}

impl SmartRouter {
    /// 创建新的智能路由器
    pub fn new() -> Self {
        let mut load_balancers = HashMap::new();
        
        // 初始化各种负载均衡策略
        load_balancers.insert(
            LoadBalancingStrategy::RoundRobin,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::RoundRobin))
        );
        load_balancers.insert(
            LoadBalancingStrategy::WeightedRoundRobin,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::WeightedRoundRobin))
        );
        load_balancers.insert(
            LoadBalancingStrategy::LeastConnections,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::LeastConnections))
        );
        load_balancers.insert(
            LoadBalancingStrategy::FastestResponse,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::FastestResponse))
        );
        load_balancers.insert(
            LoadBalancingStrategy::HealthBased,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::HealthBased))
        );
        load_balancers.insert(
            LoadBalancingStrategy::Adaptive,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::Adaptive))
        );
        load_balancers.insert(
            LoadBalancingStrategy::Geographic,
            Arc::new(IntelligentLoadBalancer::new(LoadBalancingStrategy::Geographic))
        );

        // 初始化提供商能力
        let mut provider_capabilities = HashMap::new();
        provider_capabilities.insert(
            AccountProvider::AnthropicApi,
            ProviderCapabilities {
                provider: AccountProvider::AnthropicApi,
                supported_models: vec![
                    "claude-3-sonnet".to_string(),
                    "claude-3-haiku".to_string(),
                    "claude-3-opus".to_string(),
                ],
                max_tokens: 200000,
                cost_per_1k_tokens: 0.003,
                quality_score: 0.9,
                specialties: vec![
                    RequestType::Chat,
                    RequestType::CodeGeneration,
                    RequestType::Analysis,
                    RequestType::CreativeWriting,
                ],
                supports_streaming: true,
            }
        );
        provider_capabilities.insert(
            AccountProvider::AnthropicOauth,
            ProviderCapabilities {
                provider: AccountProvider::AnthropicOauth,
                supported_models: vec![
                    "gemini-pro".to_string(),
                    "gemini-pro-vision".to_string(),
                ],
                max_tokens: 32000,
                cost_per_1k_tokens: 0.002,
                quality_score: 0.85,
                specialties: vec![
                    RequestType::Chat,
                    RequestType::Summarization,
                    RequestType::Translation,
                ],
                supports_streaming: true,
            }
        );

        Self {
            load_balancers,
            user_preferences: Arc::new(RwLock::new(HashMap::new())),
            provider_capabilities,
        }
    }

    /// 智能路由决策
    #[instrument(skip(self, user, accounts, features))]
    pub async fn route_request(
        &self,
        user: &User,
        accounts: &[UpstreamAccount],
        features: &RequestFeatures,
    ) -> AppResult<RoutingDecision> {
        info!(
            "🧭 智能路由：用户 {} 请求模型 {} (优先级: {:?})",
            user.id, features.model, features.priority
        );

        // 获取用户偏好
        let user_prefs = self.get_user_preferences(user.id).await;
        
        // 如果用户禁用了智能路由，使用简单的轮询策略
        if !user_prefs.smart_routing_enabled {
            return self.simple_route(accounts, LoadBalancingStrategy::RoundRobin).await;
        }

        // 第一步：根据请求特征过滤合适的账号
        let suitable_accounts = self.filter_suitable_accounts(accounts, features, &user_prefs).await?;
        
        if suitable_accounts.is_empty() {
            return Err(AppError::Business("没有找到合适的上游账号".to_string()));
        }

        // 第二步：选择最佳负载均衡策略
        let strategy = self.select_optimal_strategy(features, &user_prefs, &suitable_accounts).await;
        
        // 第三步：使用选定策略进行负载均衡
        let selected_account = self.execute_load_balancing(&strategy, &suitable_accounts).await?;
        
        // 第四步：计算决策置信度
        let confidence = self.calculate_confidence(&selected_account, features, &user_prefs).await;
        
        let reasoning = self.generate_reasoning(&strategy, &selected_account, features, confidence);

        let decision = RoutingDecision {
            selected_account,
            strategy_used: strategy,
            confidence_score: confidence,
            reasoning,
        };

        info!(
            "✅ 路由决策完成：账号 {} (策略: {:?}, 置信度: {:.2})",
            decision.selected_account.account_name,
            decision.strategy_used,
            decision.confidence_score
        );

        Ok(decision)
    }

    /// 过滤合适的账号
    async fn filter_suitable_accounts(
        &self,
        accounts: &[UpstreamAccount],
        features: &RequestFeatures,
        user_prefs: &UserPreferences,
    ) -> AppResult<Vec<UpstreamAccount>> {
        let mut suitable = Vec::new();

        for account in accounts {
            // 检查账号是否活跃
            if !account.is_active {
                continue;
            }

            // 检查提供商是否在用户偏好中
            if !user_prefs.preferred_providers.contains(&account.provider) {
                continue;
            }

            // 检查提供商能力
            if let Some(capabilities) = self.provider_capabilities.get(&account.provider) {
                // 检查模型支持
                if !capabilities.supported_models.contains(&features.model) &&
                   !capabilities.supported_models.iter().any(|m| m.contains("pro")) {
                    continue;
                }

                // 检查token限制
                if features.estimated_tokens > capabilities.max_tokens {
                    continue;
                }

                // 检查流式响应支持
                if features.streaming && !capabilities.supports_streaming {
                    continue;
                }

                // 检查特殊能力匹配
                if capabilities.specialties.contains(&features.request_type) {
                    // 有特殊能力的优先
                    suitable.push(account.clone());
                }
            }
        }

        // 如果严格过滤后没有结果，放宽条件
        if suitable.is_empty() {
            for account in accounts {
                if account.is_active && 
                   user_prefs.preferred_providers.contains(&account.provider) {
                    suitable.push(account.clone());
                }
            }
        }

        Ok(suitable)
    }

    /// 选择最佳负载均衡策略
    async fn select_optimal_strategy(
        &self,
        features: &RequestFeatures,
        user_prefs: &UserPreferences,
        _accounts: &[UpstreamAccount],
    ) -> LoadBalancingStrategy {
        // 根据请求特征和用户偏好选择策略
        match features.priority {
            RequestPriority::Critical => {
                // 关键请求：使用最快响应策略
                LoadBalancingStrategy::FastestResponse
            }
            RequestPriority::High => {
                // 高优先级：基于健康状态选择
                LoadBalancingStrategy::HealthBased
            }
            RequestPriority::Normal => {
                // 普通请求：智能自适应
                if user_prefs.cost_sensitivity > 0.7 {
                    // 成本敏感：使用最少连接
                    LoadBalancingStrategy::LeastConnections
                } else if user_prefs.quality_preference > 0.8 {
                    // 质量优先：自适应选择
                    LoadBalancingStrategy::Adaptive
                } else {
                    // 平衡：加权轮询
                    LoadBalancingStrategy::WeightedRoundRobin
                }
            }
            RequestPriority::Low => {
                // 低优先级：简单轮询
                LoadBalancingStrategy::RoundRobin
            }
        }
    }

    /// 执行负载均衡
    async fn execute_load_balancing(
        &self,
        strategy: &LoadBalancingStrategy,
        accounts: &[UpstreamAccount],
    ) -> AppResult<UpstreamAccount> {
        let balancer = self.load_balancers
            .get(strategy)
            .ok_or_else(|| AppError::Business("不支持的负载均衡策略".to_string()))?;

        balancer.select_account(accounts).await
    }

    /// 计算决策置信度
    async fn calculate_confidence(
        &self,
        account: &UpstreamAccount,
        features: &RequestFeatures,
        user_prefs: &UserPreferences,
    ) -> f64 {
        let mut confidence: f64 = 0.5; // 基础置信度

        // 提供商能力匹配度
        if let Some(capabilities) = self.provider_capabilities.get(&account.provider) {
            if capabilities.specialties.contains(&features.request_type) {
                confidence += 0.2;
            }
            if capabilities.supported_models.contains(&features.model) {
                confidence += 0.15;
            }
            if features.streaming && capabilities.supports_streaming {
                confidence += 0.1;
            }
        }

        // 用户偏好匹配度
        if user_prefs.preferred_providers.contains(&account.provider) {
            confidence += 0.1;
        }

        // 账号健康状态
        match account.health_status {
            crate::business::domain::HealthStatus::Healthy => confidence += 0.15,
            crate::business::domain::HealthStatus::Degraded => confidence -= 0.05,
            crate::business::domain::HealthStatus::Unhealthy => confidence -= 0.2,
            crate::business::domain::HealthStatus::Unknown => confidence -= 0.1,
        }

        confidence.min(1.0).max(0.0)
    }

    /// 生成决策推理
    fn generate_reasoning(
        &self,
        strategy: &LoadBalancingStrategy,
        account: &UpstreamAccount,
        features: &RequestFeatures,
        confidence: f64,
    ) -> String {
        let mut reasons = Vec::new();

        reasons.push(format!("策略: {:?}", strategy));
        reasons.push(format!("提供商: {:?}", account.provider));
        reasons.push(format!("健康状态: {:?}", account.health_status));
        reasons.push(format!("请求类型: {:?}", features.request_type));
        reasons.push(format!("优先级: {:?}", features.priority));
        reasons.push(format!("置信度: {:.2}", confidence));

        reasons.join(", ")
    }

    /// 简单路由（备用方案）
    async fn simple_route(
        &self,
        accounts: &[UpstreamAccount],
        strategy: LoadBalancingStrategy,
    ) -> AppResult<RoutingDecision> {
        let balancer = self.load_balancers
            .get(&strategy)
            .ok_or_else(|| AppError::Business("不支持的负载均衡策略".to_string()))?;

        let selected_account = balancer.select_account(accounts).await?;
        
        Ok(RoutingDecision {
            selected_account,
            strategy_used: strategy,
            confidence_score: 0.5,
            reasoning: "使用简单路由策略".to_string(),
        })
    }

    /// 获取用户偏好
    async fn get_user_preferences(&self, user_id: i64) -> UserPreferences {
        let prefs_guard = self.user_preferences.read().await;
        prefs_guard.get(&user_id)
            .cloned()
            .unwrap_or_else(|| {
                let mut default = UserPreferences::default();
                default.user_id = user_id;
                default
            })
    }

    /// 设置用户偏好
    pub async fn set_user_preferences(&self, prefs: UserPreferences) {
        let mut prefs_guard = self.user_preferences.write().await;
        prefs_guard.insert(prefs.user_id, prefs);
    }

    /// 记录请求结果（用于学习和优化）
    pub async fn record_request_result(
        &self,
        strategy: &LoadBalancingStrategy,
        account_id: i64,
        success: bool,
        response_time_ms: u64,
    ) {
        if let Some(balancer) = self.load_balancers.get(strategy) {
            if success {
                balancer.record_success(account_id, response_time_ms).await;
            } else {
                balancer.record_failure(account_id).await;
            }
        }
    }

    /// 获取路由统计信息
    pub async fn get_routing_stats(&self) -> HashMap<LoadBalancingStrategy, HashMap<i64, crate::business::services::load_balancer::NodeMetrics>> {
        let mut stats = HashMap::new();
        
        for (strategy, balancer) in &self.load_balancers {
            let metrics = balancer.get_all_metrics().await;
            stats.insert(strategy.clone(), metrics);
        }
        
        stats
    }
}

impl Default for SmartRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::business::domain::{AccountCredentials, HealthStatus};
    use chrono::Utc;

    fn create_test_user(id: i64) -> User {
        User {
            id,
            username: format!("user_{}", id),
            email: format!("user_{}@test.com", id),
            is_active: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn create_test_account(id: i64, provider: AccountProvider) -> UpstreamAccount {
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
            health_status: HealthStatus::Healthy,
            created_at: Utc::now(),
            last_health_check: Some(Utc::now()),
        }
    }

    #[tokio::test]
    async fn test_smart_routing_with_preferences() {
        let router = SmartRouter::new();
        let user = create_test_user(1);
        
        // 设置用户偏好
        let mut prefs = UserPreferences::default();
        prefs.user_id = 1;
        prefs.preferred_providers = vec![AccountProvider::AnthropicApi];
        prefs.smart_routing_enabled = true;
        router.set_user_preferences(prefs).await;

        let accounts = vec![
            create_test_account(1, AccountProvider::AnthropicApi),
            create_test_account(2, AccountProvider::AnthropicOauth),
        ];

        let features = RequestFeatures {
            model: "claude-3-sonnet".to_string(),
            estimated_tokens: 1000,
            priority: RequestPriority::Normal,
            user_region: Some("us-east".to_string()),
            request_type: RequestType::Chat,
            streaming: false,
        };

        let decision = router.route_request(&user, &accounts, &features).await.unwrap();
        
        // 应该选择Claude账号（用户偏好）
        assert_eq!(decision.selected_account.provider, AccountProvider::AnthropicApi);
        assert!(decision.confidence_score > 0.5);
    }

    #[tokio::test]
    async fn test_priority_based_strategy_selection() {
        let router = SmartRouter::new();
        let user = create_test_user(1);
        let accounts = vec![create_test_account(1, AccountProvider::AnthropicApi)];

        // 测试关键优先级
        let critical_features = RequestFeatures {
            model: "claude-3-sonnet".to_string(),
            estimated_tokens: 1000,
            priority: RequestPriority::Critical,
            user_region: None,
            request_type: RequestType::Chat,
            streaming: false,
        };

        let decision = router.route_request(&user, &accounts, &critical_features).await.unwrap();
        assert_eq!(decision.strategy_used, LoadBalancingStrategy::FastestResponse);
    }
}