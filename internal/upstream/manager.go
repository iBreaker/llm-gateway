package upstream

import (
	"fmt"
	"sync"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// UpstreamManager 上游账号管理器
type UpstreamManager struct {
	accounts map[string]*types.UpstreamAccount
	mutex    sync.RWMutex
}

// NewUpstreamManager 创建新的上游账号管理器
func NewUpstreamManager() *UpstreamManager {
	return &UpstreamManager{
		accounts: make(map[string]*types.UpstreamAccount),
	}
}

// AddAccount 添加上游账号
func (m *UpstreamManager) AddAccount(account *types.UpstreamAccount) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if account.ID == "" {
		account.ID = generateUpstreamID()
	}

	if account.CreatedAt.IsZero() {
		account.CreatedAt = time.Now()
	}
	account.UpdatedAt = time.Now()
	
	// 初始化使用统计
	if account.Usage == nil {
		account.Usage = &types.UpstreamUsageStats{
			TotalRequests:      0,
			SuccessfulRequests: 0,
			ErrorRequests:      0,
			TokensUsed:         0,
			LastUsedAt:         time.Now(),
			AvgLatency:         0,
			ErrorRate:          0,
		}
	}

	// 设置默认状态
	if account.Status == "" {
		account.Status = "active"
	}
	
	if account.HealthStatus == "" {
		account.HealthStatus = "unknown"
	}

	m.accounts[account.ID] = account
	return nil
}

// GetAccount 获取指定的上游账号
func (m *UpstreamManager) GetAccount(upstreamID string) (*types.UpstreamAccount, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return nil, fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	return account, nil
}

// ListAccounts 列出所有上游账号
func (m *UpstreamManager) ListAccounts() []*types.UpstreamAccount {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	accounts := make([]*types.UpstreamAccount, 0, len(m.accounts))
	for _, account := range m.accounts {
		accounts = append(accounts, account)
	}

	return accounts
}

// ListActiveAccounts 列出指定提供商的活跃账号
func (m *UpstreamManager) ListActiveAccounts(provider types.Provider) []*types.UpstreamAccount {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	var activeAccounts []*types.UpstreamAccount
	for _, account := range m.accounts {
		if account.Provider == provider && account.Status == "active" {
			activeAccounts = append(activeAccounts, account)
		}
	}

	return activeAccounts
}

// DeleteAccount 删除上游账号
func (m *UpstreamManager) DeleteAccount(upstreamID string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if _, exists := m.accounts[upstreamID]; !exists {
		return fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	delete(m.accounts, upstreamID)
	return nil
}

// UpdateAccountStatus 更新上游账号状态
func (m *UpstreamManager) UpdateAccountStatus(upstreamID string, status string) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	account.Status = status
	account.UpdatedAt = time.Now()
	return nil
}

// UpdateAccountHealth 更新上游账号健康状态
func (m *UpstreamManager) UpdateAccountHealth(upstreamID string, healthy bool) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	now := time.Now()
	account.LastHealthCheck = &now

	if healthy {
		account.HealthStatus = "healthy"
	} else {
		account.HealthStatus = "unhealthy"
	}

	account.UpdatedAt = now
	return nil
}

// RecordSuccess 记录成功请求
func (m *UpstreamManager) RecordSuccess(upstreamID string, latency time.Duration, tokensUsed int64) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	if account.Usage == nil {
		account.Usage = &types.UpstreamUsageStats{}
	}

	usage := account.Usage
	usage.TotalRequests++
	usage.SuccessfulRequests++
	usage.TokensUsed += tokensUsed
	usage.LastUsedAt = time.Now()

	// 更新平均延迟
	if usage.TotalRequests > 0 {
		usage.AvgLatency = (usage.AvgLatency*float64(usage.TotalRequests-1) + float64(latency.Milliseconds())) / float64(usage.TotalRequests)
	}

	// 更新错误率
	if usage.TotalRequests > 0 {
		usage.ErrorRate = float64(usage.ErrorRequests) / float64(usage.TotalRequests)
	}

	return nil
}

// RecordError 记录错误请求
func (m *UpstreamManager) RecordError(upstreamID string, err error) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	if account.Usage == nil {
		account.Usage = &types.UpstreamUsageStats{}
	}

	usage := account.Usage
	usage.TotalRequests++
	usage.ErrorRequests++

	now := time.Now()
	usage.LastErrorAt = &now

	// 更新错误率
	if usage.TotalRequests > 0 {
		usage.ErrorRate = float64(usage.ErrorRequests) / float64(usage.TotalRequests)
	}

	return nil
}

// UpdateOAuthTokens 更新OAuth token信息
func (m *UpstreamManager) UpdateOAuthTokens(upstreamID, accessToken, refreshToken string, expiresAt time.Time) error {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	if account.Type != types.UpstreamTypeOAuth {
		return fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	account.AccessToken = accessToken
	account.RefreshToken = refreshToken
	account.ExpiresAt = &expiresAt
	account.UpdatedAt = time.Now()
	account.Status = "active"

	return nil
}

// IsTokenExpired 检查OAuth token是否过期
func (m *UpstreamManager) IsTokenExpired(upstreamID string) (bool, error) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	account, exists := m.accounts[upstreamID]
	if !exists {
		return false, fmt.Errorf("上游账号不存在: %s", upstreamID)
	}

	if account.Type != types.UpstreamTypeOAuth {
		return false, fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	if account.ExpiresAt == nil {
		return true, nil
	}

	return time.Now().After(*account.ExpiresAt), nil
}

// GetAuthHeaders 获取上游账号的认证头部
func (m *UpstreamManager) GetAuthHeaders(account *types.UpstreamAccount) (map[string]string, error) {
	headers := make(map[string]string)
	
	switch account.Type {
	case types.UpstreamTypeAPIKey:
		switch account.Provider {
		case types.ProviderAnthropic:
			headers["x-api-key"] = account.APIKey
			headers["anthropic-version"] = "2023-06-01"
		case types.ProviderOpenAI:
			headers["Authorization"] = "Bearer " + account.APIKey
		default:
			headers["Authorization"] = "Bearer " + account.APIKey
		}
		
	case types.UpstreamTypeOAuth:
		if account.AccessToken == "" {
			return nil, fmt.Errorf("OAuth account missing access token")
		}
		
		// 检查token是否过期
		if account.ExpiresAt != nil && time.Now().After(*account.ExpiresAt) {
			return nil, fmt.Errorf("OAuth access token has expired")
		}
		
		// OAuth总是使用Bearer认证
		headers["Authorization"] = "Bearer " + account.AccessToken
		
		// Anthropic OAuth需要特殊处理
		if account.Provider == types.ProviderAnthropic {
			// 设置API版本头部
			headers["anthropic-version"] = "2023-06-01"
			// 设置OAuth特有的beta标志
			headers["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
		}
		
	default:
		return nil, fmt.Errorf("unsupported upstream auth type: %s", account.Type)
	}
	
	return headers, nil
}

// generateUpstreamID 生成上游账号ID
func generateUpstreamID() string {
	return fmt.Sprintf("upstream_%d", time.Now().UnixNano())
}