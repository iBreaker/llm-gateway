package upstream

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/iBreaker/llm-gateway/pkg/types"
)

// OAuthManager OAuth管理器
type OAuthManager struct {
	upstreamMgr   *UpstreamManager
	httpClient    *http.Client
	pkceVerifiers map[string]string // 存储每个OAuth流程的code_verifier
}

// NewOAuthManager 创建新的OAuth管理器
func NewOAuthManager(upstreamMgr *UpstreamManager) *OAuthManager {
	// 创建支持代理的HTTP客户端
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment, // 自动读取HTTP_PROXY/HTTPS_PROXY环境变量
	}
	
	return &OAuthManager{
		upstreamMgr:   upstreamMgr,
		pkceVerifiers: make(map[string]string),
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: transport,
		},
	}
}

// AnthropicOAuthConfig Anthropic OAuth配置
type AnthropicOAuthConfig struct {
	AuthURL     string
	TokenURL    string
	ClientID    string
	RedirectURI string
	Scope       string
}

const (
	// Anthropic Claude Code OAuth 固定配置
	AnthropicClientID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
	// 不同的scope配置
	ScopesFull  = "org:create_api_key user:profile user:inference"
	ScopesSetup = "user:inference"
)

// generateRandomString 生成随机字符串
func generateRandomString() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("生成随机字符串失败: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

// generatePKCE 生成PKCE参数
func generatePKCE() (codeVerifier, codeChallenge string, err error) {
	// 生成code_verifier
	codeVerifier, err = generateRandomString()
	if err != nil {
		return "", "", fmt.Errorf("生成code_verifier失败: %w", err)
	}
	
	// 生成code_challenge (SHA256哈希后base64url编码)
	hash := sha256.Sum256([]byte(codeVerifier))
	codeChallenge = base64.RawURLEncoding.EncodeToString(hash[:])
	
	return codeVerifier, codeChallenge, nil
}

// getAnthropicConfig 获取Anthropic OAuth配置
func (m *OAuthManager) getAnthropicConfig() AnthropicOAuthConfig {
	return AnthropicOAuthConfig{
		AuthURL:     "https://claude.ai/oauth/authorize",
		TokenURL:    "https://console.anthropic.com/v1/oauth/token",
		ClientID:    AnthropicClientID,
		RedirectURI: "https://console.anthropic.com/oauth/code/callback", // 使用官方回调地址，会显示code
		Scope:       ScopesFull, // 使用完整scope
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
	
	// 生成PKCE参数
	codeVerifier, codeChallenge, err := generatePKCE()
	if err != nil {
		return "", fmt.Errorf("生成PKCE参数失败: %w", err)
	}
	
	// 生成随机state参数
	state, err := generateRandomString()
	if err != nil {
		return "", fmt.Errorf("生成state参数失败: %w", err)
	}
	
	// 存储code_verifier和state用于后续验证
	m.pkceVerifiers[upstreamID] = codeVerifier
	// TODO: 也需要存储state用于验证
	
	// 构建授权URL - 按照工作示例的确切顺序
	params := url.Values{}
	params.Add("code", "true")
	params.Add("client_id", config.ClientID)
	params.Add("response_type", "code")
	params.Add("redirect_uri", config.RedirectURI)
	params.Add("scope", config.Scope)
	params.Add("code_challenge", codeChallenge)
	params.Add("code_challenge_method", "S256")
	params.Add("state", state)

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

	// 获取存储的code_verifier
	codeVerifier, exists := m.pkceVerifiers[upstreamID]
	if !exists {
		return fmt.Errorf("未找到对应的code_verifier，请重新启动OAuth流程")
	}

	// 清理授权码 - 移除URL片段和其他参数
	cleanedCode := code
	if idx := strings.Index(code, "#"); idx != -1 {
		cleanedCode = code[:idx]
	}
	if idx := strings.Index(cleanedCode, "&"); idx != -1 {
		cleanedCode = cleanedCode[:idx]
	}

	// 交换authorization code获取access token
	tokenReq := map[string]string{
		"grant_type":    "authorization_code",
		"client_id":     config.ClientID,
		"code":          cleanedCode,
		"redirect_uri":  config.RedirectURI,
		"code_verifier": codeVerifier,
		"state":         upstreamID,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq)
	if err != nil {
		return fmt.Errorf("交换token失败: %w", err)
	}

	// 计算过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息
	err = m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		tokenResp.RefreshToken,
		expiresAt,
	)
	
	// 清理存储的code_verifier (无论成功还是失败都要清理)
	delete(m.pkceVerifiers, upstreamID)
	
	return err
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
		"client_id":     config.ClientID,
		"refresh_token": account.RefreshToken,
	}

	tokenResp, err := m.exchangeCodeForToken(config.TokenURL, tokenReq)
	if err != nil {
		// 如果refresh token失效，标记账号状态为需要重新授权
		if strings.Contains(err.Error(), "invalid_grant") || 
		   strings.Contains(err.Error(), "Refresh token not found") {
			// 清除失效的token信息，但保留账号配置
			m.upstreamMgr.UpdateOAuthTokens(upstreamID, "", "", time.Time{})
			return fmt.Errorf("refresh token已失效，需要重新进行OAuth授权: ./llm-gateway oauth start %s", upstreamID)
		}
		return fmt.Errorf("刷新token失败: %w", err)
	}

	// 计算新的过期时间
	expiresAt := time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second)

	// 更新账号token信息 - 如果响应中没有新的refresh token，使用原来的
	newRefreshToken := tokenResp.RefreshToken
	if newRefreshToken == "" {
		newRefreshToken = account.RefreshToken
	}

	// 更新账号token信息
	return m.upstreamMgr.UpdateOAuthTokens(
		upstreamID,
		tokenResp.AccessToken,
		newRefreshToken,
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
	// 使用form-encoded格式而不是JSON
	formData := url.Values{}
	for key, value := range tokenReq {
		formData.Set(key, value)
	}
	reqBody := formData.Encode()

	// 调试信息：打印请求内容
	fmt.Printf("🔍 DEBUG: Token请求URL: %s\n", tokenURL)
	fmt.Printf("🔍 DEBUG: Token请求Body: %s\n", reqBody)

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("User-Agent", "claude-cli/1.0.56 (external, cli)")
	req.Header.Set("Referer", "https://claude.ai/")
	req.Header.Set("Origin", "https://claude.ai")

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