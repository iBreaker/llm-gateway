package upstream

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// OAuthManager OAuth管理器
type OAuthManager struct {
	upstreamMgr *UpstreamManager
	httpClient  *http.Client
}

// NewOAuthManager 创建新的OAuth管理器
func NewOAuthManager(upstreamMgr *UpstreamManager) *OAuthManager {
	return &OAuthManager{
		upstreamMgr: upstreamMgr,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// AnthropicOAuthConfig Anthropic OAuth配置
type AnthropicOAuthConfig struct {
	AuthURL     string
	TokenURL    string
	RedirectURI string
	Scope       string
}

// getAnthropicConfig 获取Anthropic OAuth配置
func (m *OAuthManager) getAnthropicConfig() AnthropicOAuthConfig {
	return AnthropicOAuthConfig{
		AuthURL:     "https://console.anthropic.com/api/auth/oauth/authorize",
		TokenURL:    "https://console.anthropic.com/api/auth/oauth/token",
		RedirectURI: "http://localhost:8080/oauth/callback",
		Scope:       "read write",
	}
}

// StartOAuthFlow 启动OAuth授权流程
func (m *OAuthManager) StartOAuthFlow(upstreamID string) (string, error) {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return "", err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return "", fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	if account.Provider != types.ProviderAnthropic {
		return "", fmt.Errorf("目前仅支持Anthropic OAuth")
	}

	config := m.getAnthropicConfig()
	
	// 构建授权URL
	params := url.Values{}
	params.Add("client_id", account.ClientID)
	params.Add("redirect_uri", config.RedirectURI)
	params.Add("response_type", "code")
	params.Add("scope", config.Scope)
	params.Add("state", upstreamID) // 使用upstream_id作为state参数

	authURL := fmt.Sprintf("%s?%s", config.AuthURL, params.Encode())
	return authURL, nil
}

// HandleCallback 处理OAuth回调
func (m *OAuthManager) HandleCallback(upstreamID string, code string) error {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	if account.Provider != types.ProviderAnthropic {
		return fmt.Errorf("目前仅支持Anthropic OAuth")
	}

	config := m.getAnthropicConfig()

	// 交换authorization code获取access token
	tokenReq := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     account.ClientID,
		"client_secret": account.ClientSecret,
		"code":          code,
		"redirect_uri":  config.RedirectURI,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq)
	if err != nil {
		return fmt.Errorf("交换token失败: %w", err)
	}

	// 计算过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息
	return m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		tokenResp.RefreshToken,
		expiresAt,
	)
}

// RefreshToken 刷新OAuth token
func (m *OAuthManager) RefreshToken(upstreamID string) error {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return fmt.Errorf("账号类型不是OAuth: %s", upstreamID)
	}

	if account.RefreshToken == "" {
		return fmt.Errorf("没有refresh token")
	}

	if account.Provider != types.ProviderAnthropic {
		return fmt.Errorf("目前仅支持Anthropic OAuth")
	}

	config := m.getAnthropicConfig()

	// 使用refresh token获取新的access token
	tokenReq := map[string]string{
		"grant_type":    "refresh_token",
		"client_id":     account.ClientID,
		"client_secret": account.ClientSecret,
		"refresh_token": account.RefreshToken,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq)
	if err != nil {
		return fmt.Errorf("刷新token失败: %w", err)
	}

	// 计算新的过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息
	return m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		tokenResp.RefreshToken,
		expiresAt,
	)
}

// IsTokenValid 检查token是否有效
func (m *OAuthManager) IsTokenValid(upstreamID string) bool {
	expired, err := m.upstreamMgr.IsTokenExpired(upstreamID)
	if err != nil {
		return false
	}
	return !expired
}

// AutoRefreshIfNeeded 如果需要则自动刷新token
func (m *OAuthManager) AutoRefreshIfNeeded(upstreamID string) error {
	account, err := m.upstreamMgr.GetAccount(upstreamID)
	if err != nil {
		return err
	}

	if account.Type != types.UpstreamTypeOAuth {
		return nil // 不是OAuth账号，无需刷新
	}

	// 检查是否即将过期（提前5分钟刷新）
	if account.ExpiresAt != nil {
		timeUntilExpiry := time.Until(*account.ExpiresAt)
		if timeUntilExpiry < 5*time.Minute {
			return m.RefreshToken(upstreamID)
		}
	}

	return nil
}

// TokenResponse OAuth token响应结构
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
}

// exchangeCodeForToken 交换授权码获取token
func (m *OAuthManager) exchangeCodeForToken(tokenURL string, tokenReq map[string]string) (*TokenResponse, error) {
	reqBody, err := json.Marshal(tokenReq)
	if err != nil {
		return nil, fmt.Errorf("序列化请求失败: %w", err)
	}

	req, err := http.NewRequest("POST", tokenURL, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("发送请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token请求失败，状态码: %d, 响应: %s", resp.StatusCode, string(body))
	}

	var tokenResp TokenResponse
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return nil, fmt.Errorf("解析token响应失败: %w", err)
	}

	return &tokenResp, nil
}