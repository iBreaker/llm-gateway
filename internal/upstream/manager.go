package upstream

import (
	"fmt"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// ConfigManager 配置管理器接口
type ConfigManager interface {
	CreateUpstreamAccount(account *types.UpstreamAccount) error
	GetUpstreamAccount(accountID string) (*types.UpstreamAccount, error)
	ListUpstreamAccounts() []*types.UpstreamAccount
	ListActiveUpstreamAccounts(provider types.Provider) []*types.UpstreamAccount
	UpdateUpstreamAccount(accountID string, updater func(*types.UpstreamAccount) error) error
	DeleteUpstreamAccount(accountID string) error
}

// UpstreamManager 上游账号业务管理器
type UpstreamManager struct {
	configMgr ConfigManager
}

// NewUpstreamManager 创建新的上游账号管理器
func NewUpstreamManager(configMgr ConfigManager) *UpstreamManager {
	return &UpstreamManager{
		configMgr: configMgr,
	}
}

// AddAccount 添加上游账号（业务逻辑）
func (m *UpstreamManager) AddAccount(account *types.UpstreamAccount) error {
	// 业务逻辑：设置默认值
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

	// 通过ConfigManager保存
	return m.configMgr.CreateUpstreamAccount(account)
}

// GetAccount 获取指定的上游账号
func (m *UpstreamManager) GetAccount(upstreamID string) (*types.UpstreamAccount, error) {
	return m.configMgr.GetUpstreamAccount(upstreamID)
}

// ListAccounts 列出所有上游账号
func (m *UpstreamManager) ListAccounts() []*types.UpstreamAccount {
	return m.configMgr.ListUpstreamAccounts()
}

// ListActiveAccounts 列出指定提供商的活跃账号
func (m *UpstreamManager) ListActiveAccounts(provider types.Provider) []*types.UpstreamAccount {
	return m.configMgr.ListActiveUpstreamAccounts(provider)
}

// DeleteAccount 删除上游账号
func (m *UpstreamManager) DeleteAccount(upstreamID string) error {
	return m.configMgr.DeleteUpstreamAccount(upstreamID)
}

// UpdateAccountStatus 更新上游账号状态（业务逻辑）
func (m *UpstreamManager) UpdateAccountStatus(upstreamID string, status string) error {
	return m.configMgr.UpdateUpstreamAccount(upstreamID, func(account *types.UpstreamAccount) error {
		account.Status = status
		account.UpdatedAt = time.Now()
		return nil
	})
}

// UpdateAccountHealth 更新上游账号健康状态（业务逻辑）
func (m *UpstreamManager) UpdateAccountHealth(upstreamID string, healthy bool) error {
	return m.configMgr.UpdateUpstreamAccount(upstreamID, func(account *types.UpstreamAccount) error {
		now := time.Now()
		account.LastHealthCheck = &now

		if healthy {
			account.HealthStatus = "healthy"
		} else {
			account.HealthStatus = "unhealthy"
		}

		account.UpdatedAt = now
		return nil
	})
}

// RecordSuccess 记录成功请求（业务逻辑）
func (m *UpstreamManager) RecordSuccess(upstreamID string, latency time.Duration, tokensUsed int64) error {
	return m.configMgr.UpdateUpstreamAccount(upstreamID, func(account *types.UpstreamAccount) error {
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
	})
}

// RecordError 记录错误请求（业务逻辑）
func (m *UpstreamManager) RecordError(upstreamID string, err error) error {
	return m.configMgr.UpdateUpstreamAccount(upstreamID, func(account *types.UpstreamAccount) error {
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
	})
}

// UpdateOAuthTokens 更新OAuth token信息（业务逻辑）
func (m *UpstreamManager) UpdateOAuthTokens(upstreamID, accessToken, refreshToken string, expiresAt time.Time) error {
	return m.UpdateOAuthTokensWithResourceURL(upstreamID, accessToken, refreshToken, "", expiresAt)
}

// UpdateOAuthTokensWithResourceURL 更新OAuth token信息和resource_url（业务逻辑）
func (m *UpstreamManager) UpdateOAuthTokensWithResourceURL(upstreamID, accessToken, refreshToken, resourceURL string, expiresAt time.Time) error {
	return m.configMgr.UpdateUpstreamAccount(upstreamID, func(account *types.UpstreamAccount) error {
		if account.Type != types.UpstreamTypeOAuth {
			return fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
		}

		account.AccessToken = accessToken
		account.RefreshToken = refreshToken
		if resourceURL != "" {
			account.ResourceURL = resourceURL
		}
		account.ExpiresAt = &expiresAt
		account.UpdatedAt = time.Now()
		account.Status = "active"

		return nil
	})
}

// IsTokenExpired 检查OAuth token是否过期（业务逻辑）
func (m *UpstreamManager) IsTokenExpired(upstreamID string) (bool, error) {
	account, err := m.configMgr.GetUpstreamAccount(upstreamID)
	if err != nil {
		return false, err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return false, fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	if account.ExpiresAt == nil {
		return true, nil
	}

	return time.Now().After(*account.ExpiresAt), nil
}

// GetAuthHeaders 获取上游账号的认证头部（业务逻辑）
func (m *UpstreamManager) GetAuthHeaders(upstreamID string) (map[string]string, error) {
	account, err := m.configMgr.GetUpstreamAccount(upstreamID)
	if err != nil {
		return nil, err
	}
	headers := make(map[string]string)

	switch account.Type {
	case types.UpstreamTypeAPIKey:
		switch account.Provider {
		case types.ProviderAnthropic:
			headers["x-api-key"] = account.APIKey
			headers["anthropic-version"] = "2023-06-01"
			// Claude Code必需的beta标识
			headers["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14"
		case types.ProviderOpenAI:
			headers["Authorization"] = "Bearer " + account.APIKey
		default:
			headers["Authorization"] = "Bearer " + account.APIKey
		}

	case types.UpstreamTypeOAuth:
		if account.AccessToken == "" {
			return nil, fmt.Errorf("OAuth account missing access token")
		}

		// 1. 提前5分钟刷新token，避免在请求过程中过期
		needRefresh := false
		if account.ExpiresAt != nil {
			timeUntilExpiry := time.Until(*account.ExpiresAt)
			if timeUntilExpiry < 5*time.Minute {
				needRefresh = true
			}
		} else {
			// 如果没有过期时间，认为已过期需要刷新
			needRefresh = true
		}

		// 如果没有refresh token，也无法刷新
		if needRefresh && account.RefreshToken == "" {
			return nil, fmt.Errorf("OAuth token已过期且无refresh token，需要重新授权: ./llm-gateway oauth start %s", upstreamID)
		}

		// 2. 如果需要刷新，调用自动刷新逻辑
		if needRefresh {
			if err := m.autoRefreshToken(account); err != nil {
				return nil, fmt.Errorf("auto refresh token failed: %w", err)
			}
			// 3. 刷新成功后，重新获取更新后的account信息
			account, err = m.configMgr.GetUpstreamAccount(upstreamID)
			if err != nil {
				return nil, fmt.Errorf("failed to get updated account after refresh: %w", err)
			}
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

		// Qwen DashScope OAuth需要特殊处理
		if account.Provider == types.ProviderQwen {
			// DashScope 特殊头部
			headers["X-DashScope-CacheControl"] = "enable"
			headers["X-DashScope-UserAgent"] = "LLM-Gateway/1.0"
		}

	default:
		return nil, fmt.Errorf("unsupported upstream auth type: %s", account.Type)
	}

	return headers, nil
}

// autoRefreshToken 自动刷新OAuth token（业务逻辑）
func (m *UpstreamManager) autoRefreshToken(account *types.UpstreamAccount) error {
	// 1. 检查是否有refresh token
	if account.RefreshToken == "" {
		return fmt.Errorf("no refresh token available for account %s", account.ID)
	}

	// 2. 创建OAuth管理器实例并调用刷新方法
	// RefreshToken内部会调用UpdateOAuthTokens更新配置中的数据
	oauthMgr := NewOAuthManager(m)
	return oauthMgr.RefreshToken(account.ID)
}

// GetBaseURL 获取上游账号的BaseURL
func (m *UpstreamManager) GetBaseURL(account *types.UpstreamAccount) string {
	// 1. 如果账号配置了自定义BaseURL，直接使用
	if account.BaseURL != "" {
		return account.BaseURL
	}
	
	// 2. Qwen OAuth特殊处理 - 使用resource_url
	if account.Provider == types.ProviderQwen && account.Type == types.UpstreamTypeOAuth {
		if account.ResourceURL != "" {
			return account.ResourceURL
		}
	}
	
	// 3. 根据提供商返回默认BaseURL
	return m.getDefaultBaseURL(account.Provider)
}

// getDefaultBaseURL 获取提供商的默认BaseURL
func (m *UpstreamManager) getDefaultBaseURL(provider types.Provider) string {
	switch provider {
	case types.ProviderAnthropic:
		return "https://api.anthropic.com"
	case types.ProviderOpenAI:
		return "https://api.openai.com"
	case types.ProviderGoogle:
		return "https://generativelanguage.googleapis.com"
	case types.ProviderAzure:
		return "https://your-resource.openai.azure.com" // 需要配置
	case types.ProviderQwen:
		return "https://dashscope.aliyuncs.com/compatible-mode/v1"
	default:
		return "https://api.anthropic.com"
	}
}

// generateUpstreamID 生成上游账号ID
func generateUpstreamID() string {
	return fmt.Sprintf("upstream_%d", time.Now().UnixNano())
}
