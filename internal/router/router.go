package router

import (
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	"github.com/iBreaker/llm-gateway/internal/upstream"
	"github.com/iBreaker/llm-gateway/pkg/types"
)

// BalanceStrategy 负载均衡策略
type BalanceStrategy string

const (
	StrategyRoundRobin  BalanceStrategy = "round_robin"
	StrategyRandom      BalanceStrategy = "random"
	StrategyHealthFirst BalanceStrategy = "health_first"
)

// RequestRouter 请求路由器
type RequestRouter struct {
	upstreamMgr *upstream.UpstreamManager
	strategy    BalanceStrategy
	rrIndex     map[types.Provider]int // Round Robin索引
	mutex       sync.Mutex
}

// NewRequestRouter 创建新的请求路由器
func NewRequestRouter(upstreamMgr *upstream.UpstreamManager, strategy BalanceStrategy) *RequestRouter {
	return &RequestRouter{
		upstreamMgr: upstreamMgr,
		strategy:    strategy,
		rrIndex:     make(map[types.Provider]int),
	}
}

// SelectUpstream 选择上游账号
func (r *RequestRouter) SelectUpstream(provider types.Provider) (*types.UpstreamAccount, error) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// 获取活跃的上游账号列表
	accounts := r.upstreamMgr.ListActiveAccounts(provider)
	if len(accounts) == 0 {
		return nil, fmt.Errorf("没有可用的%s上游账号", provider)
	}

	switch r.strategy {
	case StrategyRoundRobin:
		return r.selectRoundRobin(provider, accounts)
	case StrategyRandom:
		return r.selectRandom(accounts)
	case StrategyHealthFirst:
		return r.selectHealthFirst(accounts)
	default:
		return r.selectRandom(accounts)
	}
}

// selectRoundRobin 轮询选择
func (r *RequestRouter) selectRoundRobin(provider types.Provider, accounts []*types.UpstreamAccount) (*types.UpstreamAccount, error) {
	index := r.rrIndex[provider]
	if index >= len(accounts) {
		index = 0
	}

	selected := accounts[index]
	r.rrIndex[provider] = (index + 1) % len(accounts)

	return selected, nil
}

// selectRandom 随机选择
func (r *RequestRouter) selectRandom(accounts []*types.UpstreamAccount) (*types.UpstreamAccount, error) {
	index := rand.Intn(len(accounts))
	return accounts[index], nil
}

// selectHealthFirst 优先选择健康的账号
func (r *RequestRouter) selectHealthFirst(accounts []*types.UpstreamAccount) (*types.UpstreamAccount, error) {
	// 先尝试选择健康的账号
	healthyAccounts := make([]*types.UpstreamAccount, 0)
	for _, account := range accounts {
		if account.HealthStatus == "healthy" || account.HealthStatus == "" {
			healthyAccounts = append(healthyAccounts, account)
		}
	}

	// 如果有健康的账号，从中随机选择
	if len(healthyAccounts) > 0 {
		index := rand.Intn(len(healthyAccounts))
		return healthyAccounts[index], nil
	}

	// 如果没有健康的账号，从所有账号中选择
	index := rand.Intn(len(accounts))
	return accounts[index], nil
}

// MarkUpstreamError 标记上游账号错误
func (r *RequestRouter) MarkUpstreamError(upstreamID string, err error) {
	_ = r.upstreamMgr.UpdateAccountHealth(upstreamID, false)
	_ = r.upstreamMgr.RecordError(upstreamID, err)
}

// MarkUpstreamSuccess 标记上游账号成功
func (r *RequestRouter) MarkUpstreamSuccess(upstreamID string, latency time.Duration, tokensUsed int64) {
	_ = r.upstreamMgr.UpdateAccountHealth(upstreamID, true)
	_ = r.upstreamMgr.RecordSuccess(upstreamID, latency, tokensUsed)
}

// GetUpstreamStats 获取上游账号统计信息
func (r *RequestRouter) GetUpstreamStats() map[string]*types.UpstreamUsageStats {
	accounts := r.upstreamMgr.ListAccounts()
	stats := make(map[string]*types.UpstreamUsageStats)

	for _, account := range accounts {
		if account.Usage != nil {
			stats[account.ID] = account.Usage
		}
	}

	return stats
}

// SetStrategy 设置负载均衡策略
func (r *RequestRouter) SetStrategy(strategy BalanceStrategy) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	r.strategy = strategy
}

// DetermineProvider 根据模型名称确定提供商
func (r *RequestRouter) DetermineProvider(model string) types.Provider {
	model = strings.ToLower(model)

	// 根据模型名称前缀判断提供商
	if strings.Contains(model, "claude") || strings.Contains(model, "anthropic") {
		return types.ProviderAnthropic
	}
	if strings.Contains(model, "gpt") || strings.Contains(model, "openai") {
		return types.ProviderOpenAI
	}
	if strings.Contains(model, "gemini") || strings.Contains(model, "google") {
		return types.ProviderGoogle
	}
	if strings.Contains(model, "azure") {
		return types.ProviderAzure
	}
	if strings.Contains(model, "qwen") {
		return types.ProviderQwen
	}

	// 默认使用Anthropic
	return types.ProviderAnthropic
}
